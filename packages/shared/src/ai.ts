import type { ListingCategory, ListingCondition } from './enums';

export interface DraftListingRequest {
  photoKeys: string[];
}

export interface DraftListingResponse {
  title: string;
  description: string;
  category: ListingCategory;
  condition: ListingCondition;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
}
