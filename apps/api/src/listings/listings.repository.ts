import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CatalogQuery,
  CreateListingRequest,
  LISTING_LIMITS,
  ListingDetail,
  ListingPhoto,
  ListingRisk,
  ListingStatus,
  ListingSummary,
  Page,
  UserRole,
} from '@marketplace/shared';
import { Listing } from './listing.entity';
import { ListingPhoto as ListingPhotoEntity } from './listing-photo.entity';
import { ListingRisk as ListingRiskEntity } from './listing-risk.entity';
import { encodeCursor, decodeCursor } from './cursor';

export type Viewer =
  | { role: null }
  | { role: UserRole.CONTRIBUTOR; userId: string }
  | { role: UserRole.MODERATOR | UserRole.ADMIN };

function isModeratorOrAdmin(viewer: Viewer): boolean {
  return viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN;
}

const NOT_DELETED = 'listing.deletedAt IS NULL';
const IS_PUBLISHED = 'listing.status = :published';

// Every accessor must route through here (MAR-15). deleted_at excludes
// everyone but moderator/admin, owner included — delete is moderator-only.
function scopeToVisible(qb: SelectQueryBuilder<Listing>, viewer: Viewer): SelectQueryBuilder<Listing> {
  if (isModeratorOrAdmin(viewer)) {
    return qb;
  }

  if (viewer.role === UserRole.CONTRIBUTOR) {
    // NOT_DELETED as its own andWhere() call stays outside the OR below
    // (each where()/andWhere() call is auto-parenthesized by TypeORM).
    return qb.andWhere(NOT_DELETED).andWhere(
      new Brackets((sub) => {
        sub
          .where(IS_PUBLISHED, { published: ListingStatus.PUBLISHED })
          .orWhere('listing.contributorId = :userId', { userId: viewer.userId });
      }),
    );
  }

  return qb.andWhere(NOT_DELETED).andWhere(IS_PUBLISHED, { published: ListingStatus.PUBLISHED });
}

export const CATALOG_LIMIT = { default: 24, max: 50 } as const;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return CATALOG_LIMIT.default;
  }
  return Math.min(Math.floor(limit), CATALOG_LIMIT.max);
}

function applyFilters(qb: SelectQueryBuilder<Listing>, query: CatalogQuery): SelectQueryBuilder<Listing> {
  if (query.category) {
    qb.andWhere('listing.category = :category', { category: query.category });
  }
  if (query.condition) {
    qb.andWhere('listing.condition = :condition', { condition: query.condition });
  }
  if (query.minPrice !== undefined) {
    qb.andWhere('listing.price >= :minPrice', { minPrice: query.minPrice });
  }
  if (query.maxPrice !== undefined) {
    qb.andWhere('listing.price <= :maxPrice', { maxPrice: query.maxPrice });
  }
  if (query.options && query.options.length > 0) {
    // @> (array containment) — the GIN index from MAR-9 exists for this.
    qb.andWhere('listing.options @> :options', { options: query.options });
  }
  if (query.negotiable !== undefined) {
    qb.andWhere('listing.isNegotiable = :negotiable', { negotiable: query.negotiable });
  }
  return qb;
}

// s3Key is passed through as-is for primaryPhotoUrl: today it already
// holds a usable URL (seed data), since no real upload flow exists yet
// to make it a bare S3 object key. Converting key -> URL is that future
// issue's job, not this one's.
function toSummary(listing: Listing, primaryPhotoUrl: string | null): ListingSummary {
  return {
    id: listing.id,
    title: listing.title,
    primaryPhotoUrl,
    price: Number(listing.price),
    condition: listing.condition,
    category: listing.category,
  };
}

// listing.photos is Date-typed on the entity but ISO strings on the
// wire (ListingDetail); toISOString() here, once, is the boundary.
function toDetail(listing: Listing, photos: ListingPhoto[], risk: ListingRisk | null): ListingDetail {
  return {
    id: listing.id,
    title: listing.title,
    price: Number(listing.price),
    condition: listing.condition,
    category: listing.category,
    description: listing.description,
    isNegotiable: listing.isNegotiable,
    minPrice: listing.minPrice === null ? null : Number(listing.minPrice),
    options: listing.options,
    photos,
    status: listing.status,
    rejectionReason: listing.rejectionReason,
    contributorId: listing.contributorId,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    publishedAt: listing.publishedAt ? listing.publishedAt.toISOString() : null,
    risk,
  };
}

@Injectable()
export class ListingsRepository {
  constructor(
    @InjectRepository(Listing) private readonly repo: Repository<Listing>,
    @InjectRepository(ListingPhotoEntity) private readonly photoRepo: Repository<ListingPhotoEntity>,
    @InjectRepository(ListingRiskEntity) private readonly riskRepo: Repository<ListingRiskEntity>,
  ) {}

  // Both writes share one transaction, so a photo insert failure rolls
  // back the listing too.
  async create(contributorId: string, input: CreateListingRequest): Promise<ListingDetail> {
    const listing = await this.repo.manager.transaction(async (manager) => {
      const listingRepo = manager.getRepository(Listing);
      const photoRepo = manager.getRepository(ListingPhotoEntity);

      const entity = listingRepo.create({
        title: input.title,
        description: input.description,
        price: input.price.toFixed(LISTING_LIMITS.price.maxDecimals),
        condition: input.condition,
        category: input.category,
        isNegotiable: input.isNegotiable,
        minPrice: input.minPrice === undefined ? null : input.minPrice.toFixed(LISTING_LIMITS.price.maxDecimals),
        options: input.options,
        contributorId,
        status: ListingStatus.PENDING,
      });
      const saved = await listingRepo.save(entity);

      const photos = input.photoKeys.map((s3Key, sortOrder) =>
        photoRepo.create({ listingId: saved.id, s3Key, sortOrder }),
      );
      await photoRepo.save(photos);

      return saved;
    });

    const photos = await this.loadPhotos(listing.id);
    return toDetail(listing, photos, null);
  }

  // null for "doesn't exist" and "exists but hidden" alike — no signal
  // to leak, so no path to a 403.
  findVisibleById(id: string, viewer: Viewer): Promise<Listing | null> {
    const qb = this.repo.createQueryBuilder('listing').where('listing.id = :id', { id });
    return scopeToVisible(qb, viewer).getOne();
  }

  // risk is loaded only for moderator/admin viewers — never fetched, so
  // it can never leak into the response for anyone else (MAR-22).
  async findDetail(id: string, viewer: Viewer): Promise<ListingDetail | null> {
    const listing = await this.findVisibleById(id, viewer);
    if (!listing) {
      return null;
    }

    const [photos, risk] = await Promise.all([
      this.loadPhotos(id),
      isModeratorOrAdmin(viewer) ? this.loadRisk(id) : Promise.resolve(null),
    ]);

    return toDetail(listing, photos, risk);
  }

  private async loadPhotos(listingId: string): Promise<ListingPhoto[]> {
    const rows = await this.photoRepo.find({ where: { listingId }, order: { sortOrder: 'ASC' } });
    return rows.map((row) => ({ url: row.s3Key, sortOrder: row.sortOrder }));
  }

  private async loadRisk(listingId: string): Promise<ListingRisk | null> {
    const row = await this.riskRepo.findOneBy({ listingId });
    if (!row) {
      return null;
    }
    return { level: row.level, reasons: row.reasons, flags: row.flags, model: row.model, evaluatedAt: row.evaluatedAt.toISOString() };
  }

  async findCatalogPage(query: CatalogQuery, viewer: Viewer): Promise<Page<ListingSummary>> {
    const limit = clampLimit(query.limit);

    let qb = this.repo.createQueryBuilder('listing');
    qb = scopeToVisible(qb, viewer);
    qb = applyFilters(qb, query);

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      // Row-value comparison against the exact (created_at, id) keyset —
      // matches the MAR-9 index ordering exactly.
      qb.andWhere('(listing.createdAt, listing.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    // ::text bypasses the pg driver's Date parsing (would truncate to ms
    // before the cursor is even built — see cursor.ts). Quoted raw column
    // name, not "listing.createdAt": TypeORM's alias translation doesn't
    // apply inside addSelect() the way it does in where() — verified live,
    // the untranslated form 500s with "column listing.createdat does not
    // exist".
    qb.addSelect('"listing"."created_at"::text', 'raw_created_at')
      .orderBy('listing.createdAt', 'DESC')
      .addOrderBy('listing.id', 'DESC')
      .take(limit + 1);

    const { entities, raw } = await qb.getRawAndEntities();
    const hasMore = entities.length > limit;
    const items = entities.slice(0, limit);

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor({ createdAt: raw[items.length - 1].raw_created_at, id: items[items.length - 1].id })
        : null;

    const primaryPhotos = await this.loadPrimaryPhotos(items.map((listing) => listing.id));
    return {
      items: items.map((listing) => toSummary(listing, primaryPhotos.get(listing.id) ?? null)),
      nextCursor,
    };
  }

  // DISTINCT ON is Postgres-specific and awkward through the QueryBuilder
  // API, so this is raw SQL rather than forcing it through TypeORM.
  private async loadPrimaryPhotos(listingIds: string[]): Promise<Map<string, string>> {
    if (listingIds.length === 0) {
      return new Map();
    }
    const rows: { listing_id: string; s3_key: string }[] = await this.repo.manager.query(
      `SELECT DISTINCT ON (listing_id) listing_id, s3_key
       FROM listing_photos
       WHERE listing_id = ANY($1)
       ORDER BY listing_id, sort_order ASC`,
      [listingIds],
    );
    return new Map(rows.map((row) => [row.listing_id, row.s3_key]));
  }
}
