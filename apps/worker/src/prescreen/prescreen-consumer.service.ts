import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteMessageCommand, Message, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { PreScreenMessage } from '@marketplace/shared';
import { createSqsClient } from '../sqs/sqs-client.factory';
import { PrescreenMessageProcessor } from './prescreen-message-processor.service';

// Long-polling reduces empty-receive API calls; batching up to 5 keeps
// per-message latency low without one slow AI call blocking the rest of a
// mostly-idle queue for long.
const WAIT_TIME_SECONDS = 20;
const MAX_MESSAGES = 5;

@Injectable()
export class PrescreenConsumerService {
  private readonly logger = new Logger(PrescreenConsumerService.name);
  private readonly sqs: SQSClient;
  private readonly queueUrl: string;
  private stopping = false;
  private abortController = new AbortController();
  private inFlight: Promise<void> | null = null;

  constructor(
    config: ConfigService,
    private readonly processor: PrescreenMessageProcessor,
  ) {
    this.sqs = createSqsClient(config);
    this.queueUrl = config.getOrThrow<string>('SQS_PRESCREEN_QUEUE_URL');
  }

  async run(): Promise<void> {
    this.logger.log({ event: 'prescreen.consumer_started' });
    while (!this.stopping) {
      let messages: Message[];
      try {
        const received = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: MAX_MESSAGES,
            WaitTimeSeconds: WAIT_TIME_SECONDS,
          }),
          { abortSignal: this.abortController.signal },
        );
        messages = received.Messages ?? [];
      } catch (err) {
        if (this.stopping) break;
        this.logger.error({ event: 'prescreen.receive_failed', error: err instanceof Error ? err.message : String(err) });
        continue;
      }

      for (const message of messages) {
        this.inFlight = this.handleMessage(message);
        await this.inFlight;
        this.inFlight = null;
      }
    }
    this.logger.log({ event: 'prescreen.consumer_stopped' });
  }

  // Aborts the current long poll immediately rather than waiting out its
  // remaining WAIT_TIME_SECONDS — a slow shutdown risks the container
  // orchestrator's stop grace period expiring and SIGKILLing mid-write.
  stop(): void {
    this.stopping = true;
    this.abortController.abort();
  }

  async waitForIdle(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    const receiptHandle = message.ReceiptHandle;
    if (!receiptHandle) {
      return;
    }

    let parsed: PreScreenMessage;
    try {
      const body = JSON.parse(message.Body ?? '') as Partial<PreScreenMessage>;
      if (!body.listingId || typeof body.listingId !== 'string') {
        throw new Error('message body missing listingId');
      }
      parsed = { listingId: body.listingId, reqId: body.reqId };
    } catch (err) {
      // A malformed body will never parse successfully on retry, so
      // deleting immediately (after logging) is equivalent to letting it
      // exhaust the redrive policy's receive count, just without wasting
      // those attempts or the visibility-timeout wait between them.
      this.logger.warn({
        event: 'prescreen.malformed_message',
        error: err instanceof Error ? err.message : String(err),
        body: message.Body,
      });
      await this.deleteMessage(receiptHandle);
      return;
    }

    const { listingId, reqId } = parsed;
    const startedAt = Date.now();
    this.logger.log({ event: 'prescreen.message_received', listingId, reqId });

    try {
      const outcome = await this.processor.process(parsed);
      if (outcome.status === 'not-found') {
        this.logger.warn({ event: 'prescreen.listing_not_found', listingId, reqId });
      } else {
        this.logger.log({
          event: 'prescreen.completed',
          listingId,
          reqId,
          level: outcome.level,
          latencyMs: Date.now() - startedAt,
        });
      }
      // Delete only after a successful write — a not-found listing counts
      // as "successfully handled" (retrying can't help), an upsert failure
      // does not.
      await this.deleteMessage(receiptHandle);
    } catch (err) {
      // Message is left in place; its visibility timeout expires and SQS
      // redelivers it, eventually routing to the DLQ via the queue's own
      // maxReceiveCount redrive policy once retries are exhausted.
      this.logger.error({
        event: 'prescreen.processing_failed',
        listingId,
        reqId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }));
  }
}
