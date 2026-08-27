import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { join } from 'path';

// Shared by the Nest module (pooled URL, app runtime) and the migration
// CLI (unpooled URL — Neon's pooled connection is PgBouncer in transaction
// mode, which breaks TypeORM's migration runner) so the two define
// identical schema rules and can never quietly diverge from each other.
export function buildDataSourceOptions(url: string): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url,
    // Neon connection strings carry `sslmode=require`; local Compose
    // Postgres doesn't, and doesn't have a cert chain to verify anyway.
    ssl: new URL(url).searchParams.has('sslmode') ? { rejectUnauthorized: false } : false,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  };
}
