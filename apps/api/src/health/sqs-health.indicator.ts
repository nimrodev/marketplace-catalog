import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsHealthIndicator {
  constructor(private readonly config: ConfigService) {}

  async isHealthy(): Promise<boolean> {
    const client = new SQSClient({
      region: this.config.getOrThrow<string>('AWS_REGION'),
      endpoint: this.config.get<string>('SQS_ENDPOINT'),
      requestHandler: { requestTimeout: 2000 },
    });
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
