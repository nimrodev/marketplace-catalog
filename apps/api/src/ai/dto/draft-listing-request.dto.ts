import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { DraftListingRequest } from '@marketplace/shared';

// Shared with draft-listing.service.ts's fetchImages cap, so a caller
// can't pad the request past what the endpoint actually sends the model.
export const MAX_PHOTO_KEYS = 3;

export class DraftListingRequestDto implements DraftListingRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PHOTO_KEYS)
  @IsString({ each: true })
  photoKeys!: string[];
}
