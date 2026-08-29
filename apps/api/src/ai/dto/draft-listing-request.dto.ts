import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { DraftListingRequest } from '@marketplace/shared';

// Capped at 3 — matches the number of photos actually sent to the vision
// model, so a caller can't pad the request past what the endpoint uses.
const MAX_PHOTO_KEYS = 3;

export class DraftListingRequestDto implements DraftListingRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PHOTO_KEYS)
  @IsString({ each: true })
  photoKeys!: string[];
}
