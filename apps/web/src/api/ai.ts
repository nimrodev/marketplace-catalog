import type { DraftListingRequest, DraftListingResponse } from '@marketplace/shared';
import { apiClient } from './client';

export function draftListing(photoKeys: string[]): Promise<DraftListingResponse> {
  return apiClient.post<DraftListingResponse>('/ai/draft-listing', { photoKeys } satisfies DraftListingRequest);
}
