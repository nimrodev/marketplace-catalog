import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';

// Duplicated from apps/api/src/pre-screen/sqs-client.factory.ts — same
// credential handling and production safety check, kept in one place per
// app since the two apps can't share source at runtime.
export function createSqsClient(config: ConfigService, requestTimeoutMs?: number): SQSClient {
  const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
  if (config.get<string>('NODE_ENV') === 'production' && (accessKeyId || secretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must not be set in production — use the instance role.');
  }
  return new SQSClient({
    region: config.getOrThrow<string>('AWS_REGION'),
    endpoint: config.get<string>('SQS_ENDPOINT'),
    ...(requestTimeoutMs ? { requestHandler: { requestTimeout: requestTimeoutMs } } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}
