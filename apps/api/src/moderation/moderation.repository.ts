import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListingStatus, ModerationQueueItem, Page, RiskLevel } from '@marketplace/shared';
import { Listing } from '../listings/listing.entity';
import { buildPhotoUrl } from '../uploads/photo-url';
import { decodeQueueCursor, encodeQueueCursor } from './queue-cursor';

const QUEUE_LIMIT = { default: 24, max: 50 } as const;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return QUEUE_LIMIT.default;
  }
  return Math.min(Math.floor(limit), QUEUE_LIMIT.max);
}

// Unassessed sorts last: nothing is known yet, so there's no basis to
// prioritize an unscreened listing over one the pre-screen already flagged.
const RISK_RANK_SQL = `CASE lr.level WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END`;
const RISK_RANK: Record<RiskLevel, number> = { [RiskLevel.HIGH]: 0, [RiskLevel.MEDIUM]: 1, [RiskLevel.LOW]: 2 };

export interface ModerationQueueQuery {
  cursor?: string;
  limit?: number;
  risk?: RiskLevel;
}

interface QueueRow {
  id: string;
  title: string;
  price: string;
  condition: ModerationQueueItem['condition'];
  category: ModerationQueueItem['category'];
  contributor_email: string;
  raw_created_at: string;
  primary_photo_key: string | null;
  risk_level: RiskLevel | null;
  risk_reasons: string[] | null;
  risk_flags: string[] | null;
  risk_model: string | null;
  risk_evaluated_at: Date | null;
}

// Raw SQL, not QueryBuilder: the same tradeoff as loadPrimaryPhotos in
// listings.repository.ts — a computed rank driving both ORDER BY and a
// keyset WHERE, plus a non-relation join, is awkward through the
// QueryBuilder API and clearer written directly.
@Injectable()
export class ModerationRepository {
  constructor(
    @InjectRepository(Listing) private readonly repo: Repository<Listing>,
    private readonly config: ConfigService,
  ) {}

  async findQueue(query: ModerationQueueQuery): Promise<Page<ModerationQueueItem>> {
    const limit = clampLimit(query.limit);
    const conditions: string[] = [`l.status = 'PENDING'`, `l.deleted_at IS NULL`];
    const params: unknown[] = [];

    if (query.risk) {
      params.push(RISK_RANK[query.risk]);
      conditions.push(`(${RISK_RANK_SQL}) = $${params.length}`);
    }

    if (query.cursor) {
      const cursor = decodeQueueCursor(query.cursor);
      params.push(cursor.riskRank, cursor.createdAt, cursor.id);
      conditions.push(
        `(${RISK_RANK_SQL}, l.created_at, l.id) > ($${params.length - 2}, $${params.length - 1}::timestamptz, $${params.length})`,
      );
    }

    params.push(limit + 1);
    const rows: QueueRow[] = await this.repo.manager.query(
      `SELECT l.id, l.title, l.price, l.condition, l.category, l.created_at::text AS raw_created_at,
              u.email AS contributor_email,
              (SELECT s3_key FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS primary_photo_key,
              lr.level AS risk_level, lr.reasons AS risk_reasons, lr.flags AS risk_flags,
              lr.model AS risk_model, lr.evaluated_at AS risk_evaluated_at
       FROM listings l
       JOIN users u ON u.id = l.contributor_id
       LEFT JOIN listing_risk lr ON lr.listing_id = l.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY (${RISK_RANK_SQL}) ASC, l.created_at ASC, l.id ASC
       LIMIT $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore
      ? encodeQueueCursor({
          riskRank: items[items.length - 1].risk_level ? RISK_RANK[items[items.length - 1].risk_level!] : 3,
          createdAt: items[items.length - 1].raw_created_at,
          id: items[items.length - 1].id,
        })
      : null;

    return { items: items.map((row) => this.toQueueItem(row)), nextCursor };
  }

  private toQueueItem(row: QueueRow): ModerationQueueItem {
    return {
      id: row.id,
      title: row.title,
      primaryPhotoUrl: row.primary_photo_key ? buildPhotoUrl(row.primary_photo_key, this.config) : null,
      price: Number(row.price),
      condition: row.condition,
      category: row.category,
      // The query already filters to PENDING — every row here is one.
      status: ListingStatus.PENDING,
      contributorEmail: row.contributor_email,
      submittedAt: new Date(row.raw_created_at).toISOString(),
      risk: row.risk_level
        ? {
            level: row.risk_level,
            reasons: row.risk_reasons ?? [],
            flags: row.risk_flags ?? [],
            model: row.risk_model!,
            evaluatedAt: row.risk_evaluated_at!.toISOString(),
          }
        : null,
    };
  }
}
