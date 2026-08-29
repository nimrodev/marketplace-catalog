import { BadRequestException } from '@nestjs/common';
import { CatalogQuery, ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';

// Hand-rolled, not a class-validator DTO: MAR-16 (the DTO/validation
// layer) is a separate, later issue scoped to write requests. This is
// just enough boundary validation so a bad query param 400s instead of
// crashing the DB driver on an enum/type mismatch.
export function parseCatalogQuery(raw: Record<string, unknown>): CatalogQuery {
  const query: CatalogQuery = {};

  if (raw.cursor !== undefined) {
    query.cursor = String(raw.cursor);
  }

  if (raw.limit !== undefined) {
    query.limit = parseNumber(raw.limit, 'limit');
  }

  if (raw.category !== undefined) {
    query.category = parseEnum(raw.category, ListingCategory, 'category');
  }

  if (raw.condition !== undefined) {
    query.condition = parseEnum(raw.condition, ListingCondition, 'condition');
  }

  if (raw.minPrice !== undefined) {
    query.minPrice = parseNumber(raw.minPrice, 'minPrice');
  }

  if (raw.maxPrice !== undefined) {
    query.maxPrice = parseNumber(raw.maxPrice, 'maxPrice');
  }

  if (raw.options !== undefined) {
    const values = Array.isArray(raw.options) ? raw.options : [raw.options];
    query.options = values.map((value) => parseEnum(value, ListingOption, 'options'));
  }

  if (raw.negotiable !== undefined) {
    query.negotiable = parseBoolean(raw.negotiable, 'negotiable');
  }

  if (raw.mine !== undefined) {
    query.mine = parseBoolean(raw.mine, 'mine');
  }

  return query;
}

function parseEnum<T extends string>(value: unknown, enumObject: Record<string, T>, field: string): T {
  const allowed = Object.values(enumObject);
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`Invalid ${field}: ${String(value)}`);
  }
  return value as T;
}

function parseNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`Invalid ${field}: ${String(value)}`);
  }
  return n;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(`Invalid ${field}: ${String(value)}`);
}
