import { ConfigService } from '@nestjs/config';

// Mirrors createS3Client's endpoint choice so a stored key resolves to a
// URL the browser can actually load: LocalStack's host-mapped port in
// dev/CI, real S3's virtual-hosted-style URL in production.
//
// Seed data (MAR-11) stores full remote photo URLs directly in this same
// column, predating the real upload flow — those pass through unchanged
// rather than getting a bucket URL prepended onto an already-absolute one.
export function buildPhotoUrl(key: string, config: ConfigService): string {
  if (/^https?:\/\//.test(key)) {
    return key;
  }
  const bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
  // S3_PUBLIC_ENDPOINT rewrites for dev, where the API reaches LocalStack
  // over the Docker network but the browser needs the host-mapped port;
  // S3_ENDPOINT covers CI, where both sides already share one localhost.
  const endpoint = config.get<string>('S3_PUBLIC_ENDPOINT') ?? config.get<string>('S3_ENDPOINT');
  if (endpoint) {
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
  }
  const region = config.getOrThrow<string>('AWS_REGION');
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
