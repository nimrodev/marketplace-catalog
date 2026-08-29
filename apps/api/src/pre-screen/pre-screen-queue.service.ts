import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { createSqsClient } from './sqs-client.factory';

export interface PreScreenMessage {
  listingId: string;
  // Not yet populated — lands once structured logging introduces a
  // correlation id; the shape is ready for it so the worker doesn't need
  // a second message-format change later.
  reqId?: string;
}

@Injectable()
export class PreScreenQueueService {
  private readonly logger = new Logger(PreScreenQueueService.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(config: ConfigService) {
    this.client = createSqsClient(config);
    this.queueUrl = config.getOrThrow<string>('SQS_PRESCREEN_QUEUE_URL');
  }

  // Best-effort: a failed enqueue is logged, never thrown, so an SQS
  // outage degrades to "no pre-screen yet" rather than blocking the
  // submission that triggered it.
  async enqueue(listingId: string): Promise<void> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({ listingId } satisfies PreScreenMessage),
        }),
      );
    } catch (err) {
      this.logger.warn({
        event: 'pre_screen.enqueue_failed',
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
