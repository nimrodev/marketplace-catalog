// Layer 1 validation limits (PLAN.md §4) — the single source both the API's
// DTO validators and the frontend form mirror, so the two never drift.
export const LISTING_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 20, max: 5000 },
  price: { min: 0, max: 10_000_000, exclusiveMin: true, maxDecimals: 2 },
  options: { max: 6 },
  photos: { min: 1, max: 5, maxBytes: 5 * 1024 * 1024 },
} as const;

export const ALLOWED_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoContentType = (typeof ALLOWED_PHOTO_CONTENT_TYPES)[number];

export const MODERATION_LIMITS = {
  rejectionReason: { min: 10, max: 500 },
} as const;
