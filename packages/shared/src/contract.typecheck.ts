// Not runtime code — a compile-time proof that the contract types in this
// package are actually usable, not just structurally self-consistent.
// `pnpm build` (tsc) fails if any literal below stops satisfying its type,
// which is what "the contract compiles" means for pure interfaces: there's
// no runtime behavior to unit-test, only shape to typecheck.
import {
  ApiErrorResponse,
  AuthUser,
  CatalogQuery,
  CreateListingRequest,
  DraftListingRequest,
  DraftListingResponse,
  ListingCategory,
  ListingCondition,
  ListingDetail,
  ListingOption,
  ListingStatus,
  ListingSummary,
  LoginRequest,
  ModerationQueueItem,
  Page,
  PresignRequest,
  PresignResponse,
  RejectedListingItem,
  RejectRequest,
  RiskLevel,
  UpdateListingRequest,
  UserRole,
} from './index';

const listingSummary: ListingSummary = {
  id: 'listing-1',
  title: 'Vintage bicycle',
  primaryPhotoUrl: 'https://cdn.example.com/listings/1/photo-0.jpg',
  price: 150,
  condition: ListingCondition.GOOD,
  category: ListingCategory.SPORTS_OUTDOORS,
  status: ListingStatus.PUBLISHED,
  rejectionReason: null,
};

const listingDetail: ListingDetail = {
  ...listingSummary,
  description: 'A well-loved road bike, recently serviced.',
  isNegotiable: true,
  minPrice: 100,
  options: [ListingOption.LOCAL_PICKUP, ListingOption.DELIVERY_AVAILABLE],
  photos: [{ url: listingSummary.primaryPhotoUrl!, key: 'listings/user-1/photo-0.jpg', sortOrder: 0 }],
  contributorId: 'user-1',
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

const catalogPage: Page<ListingSummary> = {
  items: [listingSummary],
  nextCursor: null,
};

const catalogQuery: CatalogQuery = {
  limit: 20,
  category: ListingCategory.SPORTS_OUTDOORS,
  options: [ListingOption.LOCAL_PICKUP],
  negotiable: true,
  status: ListingStatus.REJECTED,
};

const createListingRequest: CreateListingRequest = {
  title: listingSummary.title,
  description: listingDetail.description,
  price: listingSummary.price,
  condition: listingSummary.condition,
  category: listingSummary.category,
  isNegotiable: true,
  minPrice: 100,
  options: [ListingOption.LOCAL_PICKUP],
  photoKeys: ['listings/user-1/abc123.jpg'],
};

const updateListingRequest: UpdateListingRequest = {
  price: 140,
};

const presignRequest: PresignRequest = {
  contentType: 'image/jpeg',
  contentLength: 1024 * 1024,
};

const presignResponse: PresignResponse = {
  url: 'https://s3.example.com/presigned-put',
  key: 'listings/user-1/abc123.jpg',
};

const loginRequest: LoginRequest = {
  email: 'mod@example.com',
  password: 'hunter2',
};

const authUser: AuthUser = {
  id: 'user-1',
  email: loginRequest.email,
  role: UserRole.MODERATOR,
};

const moderationQueueItem: ModerationQueueItem = {
  ...listingSummary,
  contributorEmail: 'seller@example.com',
  submittedAt: new Date().toISOString(),
  risk: null,
};

const rejectedListingItem: RejectedListingItem = {
  ...listingSummary,
  status: ListingStatus.REJECTED,
  rejectionReason: 'Description does not match photos.',
  contributorEmail: 'seller@example.com',
  rejectedAt: new Date().toISOString(),
};

const rejectRequest: RejectRequest = {
  reason: 'Description does not match photos.',
};

const draftRequest: DraftListingRequest = {
  photoKeys: ['listings/user-1/abc123.jpg'],
};

const draftResponse: DraftListingResponse = {
  title: 'Suggested title',
  description: 'Suggested description',
  category: ListingCategory.OTHER,
  condition: ListingCondition.GOOD,
  suggestedPriceMin: 80,
  suggestedPriceMax: 120,
};

const errorResponse: ApiErrorResponse = {
  statusCode: 400,
  error: 'Bad Request',
  message: 'Validation failed',
  fieldErrors: { title: ['must be at least 3 characters'] },
};

// Referenced so nothing above is flagged unused, without exporting them —
// this file's only job is to fail `tsc` if the contract stops typechecking.
void [
  catalogPage,
  catalogQuery,
  createListingRequest,
  updateListingRequest,
  presignRequest,
  presignResponse,
  authUser,
  moderationQueueItem,
  rejectedListingItem,
  rejectRequest,
  draftRequest,
  draftResponse,
  errorResponse,
];
