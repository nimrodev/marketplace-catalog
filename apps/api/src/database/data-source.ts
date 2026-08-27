// Standalone entry point for the TypeORM CLI (migration:generate/run/
// revert). Runs outside Nest's DI, so env vars are loaded directly here
// rather than through ConfigModule — same file precedence Nest uses
// (app.module.ts), first file wins.
import { config } from 'dotenv';
config({ path: '../../.env.local' });
config({ path: '.env' });

import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Migrations always run against the unpooled connection (see
// data-source-options.ts) — the app itself uses the pooled URL.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set to run migrations.');
}

export default new DataSource(buildDataSourceOptions(url));
