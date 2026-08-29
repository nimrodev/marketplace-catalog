import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

// Duplicated from apps/api/src/uploads/s3-client.factory.ts — same
// credential handling and production safety check.
export function createS3Client(config: ConfigService): S3Client {
  const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
  if (config.get<string>('NODE_ENV') === 'production' && (accessKeyId || secretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must not be set in production — use the instance role.');
  }
  const endpoint = config.get<string>('S3_ENDPOINT');
  return new S3Client({
    region: config.getOrThrow<string>('AWS_REGION'),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    // LocalStack only — real S3 resolves buckets via subdomain DNS.
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}
