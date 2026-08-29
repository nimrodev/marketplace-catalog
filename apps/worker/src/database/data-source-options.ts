import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Listing } from '../entities/listing.entity';
import { ListingPhoto } from '../entities/listing-photo.entity';
import { ListingRisk } from '../entities/listing-risk.entity';

// The worker never runs migrations (apps/api owns that), so unlike the
// API's version of this file, entities are listed explicitly rather than
// discovered via a dist-relative glob — there's no compiled-output layout
// to depend on here.
export function buildDataSourceOptions(url: string): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url,
    // Neon connection strings carry `sslmode=require`; local Compose
    // Postgres doesn't, and doesn't have a cert chain to verify anyway.
    ssl: new URL(url).searchParams.has('sslmode') ? { rejectUnauthorized: false } : false,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    entities: [Listing, ListingPhoto, ListingRisk],
  };
}
