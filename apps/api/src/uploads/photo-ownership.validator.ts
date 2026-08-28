import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ALLOWED_PHOTO_CONTENT_TYPES, LISTING_LIMITS } from '@marketplace/shared';
import { createS3Client } from './s3-client.factory';

function isAllowedContentType(value: string | undefined): boolean {
  return !!value && (ALLOWED_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches exactly what buildPhotoKey (MAR-23) generates for this specific
// user — anything else (another user's prefix, a hand-crafted path, an
// extension buildPhotoKey never produces) fails the format check outright.
function keyPatternFor(userId: string): RegExp {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  return new RegExp(`^listings/${escapeForRegExp(userId)}/${uuid}\\.(jpg|png|webp)$`);
}

@Injectable()
export class PhotoOwnershipValidator {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.client = createS3Client(config);
    this.bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
  }

  // Every key must (1) match this exact user's prefix and buildPhotoKey's
  // format, (2) exist in S3, (3) be within the size cap, (4) have an
  // allowed content type. Any single failure rejects the whole submission
  // (MAR-17) — never just the offending photo, so a submission is either
  // fully trustworthy or not persisted at all.
  async validate(userId: string, photoKeys: string[]): Promise<void> {
    const pattern = keyPatternFor(userId);

    for (const key of photoKeys) {
      if (!pattern.test(key)) {
        throw new BadRequestException(`Photo "${key}" does not belong to you or is not a valid photo key.`);
      }

      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => null);
      if (!head) {
        throw new BadRequestException(`Photo "${key}" was not found.`);
      }

      if ((head.ContentLength ?? 0) > LISTING_LIMITS.photos.maxBytes) {
        throw new BadRequestException(`Photo "${key}" exceeds the ${LISTING_LIMITS.photos.maxBytes}-byte limit.`);
      }

      if (!isAllowedContentType(head.ContentType)) {
        throw new BadRequestException(`Photo "${key}" has an unsupported content type.`);
      }
    }
  }
}
