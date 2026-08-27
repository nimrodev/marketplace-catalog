import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { CatalogQuery, ListingStatus, ListingSummary, Page, UserRole } from '@marketplace/shared';
import { Listing } from './listing.entity';
import { encodeCursor, decodeCursor } from './cursor';

export type Viewer =
  | { role: null }
  | { role: UserRole.CONTRIBUTOR; userId: string }
  | { role: UserRole.MODERATOR | UserRole.ADMIN };

const NOT_DELETED = 'listing.deletedAt IS NULL';
const IS_PUBLISHED = 'listing.status = :published';

// Every accessor must route through here (MAR-15). deleted_at excludes
// everyone but moderator/admin, owner included — delete is moderator-only.
function scopeToVisible(qb: SelectQueryBuilder<Listing>, viewer: Viewer): SelectQueryBuilder<Listing> {
  if (viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN) {
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

@Injectable()
export class ListingsRepository {
  constructor(@InjectRepository(Listing) private readonly repo: Repository<Listing>) {}

  // null for "doesn't exist" and "exists but hidden" alike — no signal
  // to leak, so no path to a 403.
  findVisibleById(id: string, viewer: Viewer): Promise<Listing | null> {
    const qb = this.repo.createQueryBuilder('listing').where('listing.id = :id', { id });
    return scopeToVisible(qb, viewer).getOne();
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
