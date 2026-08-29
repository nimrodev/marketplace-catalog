import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ALLOWED_PHOTO_CONTENT_TYPES, PhotoContentType } from '@marketplace/shared';
import { createS3Client } from '../s3/s3-client.factory';
import { StructuredImage } from './anthropic-client.service';

// Same fetch-and-base64-encode pattern as apps/api's
// DraftListingService.fetchImages — duplicated for the same reason as the
// rest of apps/worker/src/ai.
@Injectable()
export class PhotoFetcherService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.s3 = createS3Client(config);
    this.bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
  }

  async fetch(photoKeys: string[]): Promise<StructuredImage[]> {
    const images: StructuredImage[] = [];
    for (const key of photoKeys) {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes) continue;
      const mediaType = isSupportedMediaType(object.ContentType) ? object.ContentType : 'image/jpeg';
      images.push({ mediaType, base64: Buffer.from(bytes).toString('base64') });
    }
    return images;
  }
}

function isSupportedMediaType(value: string | undefined): value is PhotoContentType {
  return !!value && (ALLOWED_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}
