import type { ListingCategory, ListingCondition, ListingOption, ListingStatus } from './enums';
import type { ListingRisk } from './moderation';

export interface ListingPhoto {
  url: string;
  // The raw storage key behind `url` — needed to send an unchanged photo
  // back in an update's photoKeys without re-uploading it.
  key: string;
  sortOrder: number;
}

// The catalog card — deliberately narrow, one row per listing in /listings.
// status is here (not just on ListingDetail) so a moderator/admin browsing
// the catalog — which, unlike everyone else, includes non-published rows —
// can tell them apart; harmless for every other viewer, who never sees a
// non-published row in the first place.
export interface ListingSummary {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number;
  condition: ListingCondition;
  category: ListingCategory;
  status: ListingStatus;
}

export interface ListingDetail extends Omit<ListingSummary, 'primaryPhotoUrl'> {
  description: string;
  isNegotiable: boolean;
  minPrice: number | null;
  options: ListingOption[];
  photos: ListingPhoto[];
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
  // Scoped to the authenticated caller's own listings, every status
  // included — the one case where PENDING/REJECTED rows are intentionally
  // visible outside moderation. Requires auth; ignores every other viewer's
  // usual PUBLISHED-only scoping rather than composing with it.
  mine?: boolean;
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
