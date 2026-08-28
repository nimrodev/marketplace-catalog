import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

// Shared by UploadsService and PhotoOwnershipValidator so the credential
// handling — and the production safety check — exists in exactly one place.
export function createS3Client(config: ConfigService): S3Client {
  const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
  // A static key in production would sit on disk indefinitely, unlike the
  // EC2 instance role's rotating credentials (MAR-43) — fail startup
  // rather than silently accept one.
  if (config.get<string>('NODE_ENV') === 'production' && (accessKeyId || secretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must not be set in production — use the instance role.');
  }
  return new S3Client({
    region: config.getOrThrow<string>('AWS_REGION'),
    // Only for local dev/CI — production omits these and the SDK picks up
    // the EC2 instance role's rotating credentials automatically.
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}
