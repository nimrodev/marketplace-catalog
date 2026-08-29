import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { createSqsClient } from '../pre-screen/sqs-client.factory';

@Injectable()
export class SqsHealthIndicator {
  constructor(private readonly config: ConfigService) {}

  async isHealthy(): Promise<boolean> {
    const client = createSqsClient(this.config, 2000);
    try {
      await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: this.config.getOrThrow<string>('SQS_PRESCREEN_QUEUE_URL'),
          AttributeNames: ['QueueArn'],
        }),
      );
      return true;
    } catch {
      return false;
    } finally {
      client.destroy();
    }
  }
}
