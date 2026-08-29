import { BadRequestException } from '@nestjs/common';
import { RiskLevel } from '@marketplace/shared';
import { ModerationQueueQuery } from './moderation.repository';

// Same hand-rolled approach as listings/parse-catalog-query.ts — a query
// param DTO layer is scoped to write requests, not this read path.
export function parseQueueQuery(raw: Record<string, unknown>): ModerationQueueQuery {
  const query: ModerationQueueQuery = {};

  if (raw.cursor !== undefined) {
    query.cursor = String(raw.cursor);
  }

  if (raw.limit !== undefined) {
    const n = Number(raw.limit);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`Invalid limit: ${String(raw.limit)}`);
    }
    query.limit = n;
  }

  if (raw.risk !== undefined) {
    const allowed = Object.values(RiskLevel);
    if (typeof raw.risk !== 'string' || !allowed.includes(raw.risk as RiskLevel)) {
      throw new BadRequestException(`Invalid risk: ${String(raw.risk)}`);
    }
    query.risk = raw.risk as RiskLevel;
  }

  return query;
}
