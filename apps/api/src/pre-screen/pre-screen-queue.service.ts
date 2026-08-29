import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { PreScreenMessage } from '@marketplace/shared';
import { createSqsClient } from './sqs-client.factory';

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
