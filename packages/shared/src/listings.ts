import type { ListingCategory, ListingCondition, ListingOption, ListingStatus } from './enums';
import type { ListingRisk } from './moderation';

export interface ListingPhoto {
  url: string;
  sortOrder: number;
}

// The catalog card — deliberately narrow, one row per listing in /listings.
export interface ListingSummary {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number;
  condition: ListingCondition;
  category: ListingCategory;
}

export interface ListingDetail extends Omit<ListingSummary, 'primaryPhotoUrl'> {
  description: string;
  isNegotiable: boolean;
  minPrice: number | null;
  options: ListingOption[];
  photos: ListingPhoto[];
  status: ListingStatus;
  rejectionReason: string | null;
  contributorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  // null (not omitted) when the caller isn't a moderator/admin — an
  // explicit value on the wire, not a field the frontend has to guess is
  // "absent vs. not yet loaded." Same shape as ModerationQueueItem.risk.
  risk: ListingRisk | null;
}

export interface CatalogQuery {
  cursor?: string;
  limit?: number;
  category?: ListingCategory;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  options?: ListingOption[];
  negotiable?: boolean;
}

export interface CreateListingRequest {
  title: string;
  description: string;
  price: number;
  condition: ListingCondition;
  category: ListingCategory;
  isNegotiable: boolean;
  minPrice?: number;
  options: ListingOption[];
  photoKeys: string[];
}

export type UpdateListingRequest = Partial<CreateListingRequest>;
