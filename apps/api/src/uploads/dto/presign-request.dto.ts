import { IsIn, IsInt, IsPositive, Max } from 'class-validator';
import { ALLOWED_PHOTO_CONTENT_TYPES, LISTING_LIMITS, PhotoContentType, PresignRequest } from '@marketplace/shared';

export class PresignRequestDto implements PresignRequest {
  @IsIn(ALLOWED_PHOTO_CONTENT_TYPES)
  contentType!: PhotoContentType;

  @IsInt()
  @IsPositive()
  @Max(LISTING_LIMITS.photos.maxBytes)
  contentLength!: number;
}
