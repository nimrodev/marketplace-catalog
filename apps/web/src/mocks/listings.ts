// Proves apps/web can build screens against the shared contract with
// mocked data and no API running (MAR-50 acceptance criterion) — real
// screens land in later issues (MAR-37 catalog grid, MAR-39 detail page)
// and will replace these fixtures with TanStack Query hooks over apiClient.
import {
  ListingCategory,
  ListingCondition,
  ListingDetail,
  ListingOption,
  ListingStatus,
  ListingSummary,
  Page,
  RiskLevel,
} from '@marketplace/shared';

export const mockListingSummary: ListingSummary = {
  id: 'mock-listing-1',
  title: 'Vintage bicycle',
  primaryPhotoUrl: 'https://picsum.photos/seed/mock-listing-1/400/300',
  price: 150,
  condition: ListingCondition.GOOD,
  category: ListingCategory.SPORTS_OUTDOORS,
};

export const mockCatalogPage: Page<ListingSummary> = {
  items: [mockListingSummary],
  nextCursor: null,
};

export const mockListingDetail: ListingDetail = {
  id: mockListingSummary.id,
  title: mockListingSummary.title,
  price: mockListingSummary.price,
  condition: mockListingSummary.condition,
  category: mockListingSummary.category,
  description: 'A well-loved road bike, recently serviced.',
  isNegotiable: true,
  minPrice: 100,
  options: [ListingOption.LOCAL_PICKUP, ListingOption.DELIVERY_AVAILABLE],
  photos: [{ url: mockListingSummary.primaryPhotoUrl!, sortOrder: 0 }],
  status: ListingStatus.PUBLISHED,
  rejectionReason: null,
  contributorId: 'mock-user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  risk: {
    level: RiskLevel.LOW,
    reasons: [],
    flags: [],
    model: 'claude-haiku-4-5',
    evaluatedAt: new Date().toISOString(),
  },
};
