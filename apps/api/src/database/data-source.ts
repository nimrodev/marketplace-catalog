// Standalone entry point for the TypeORM CLI (migration:generate/run/
// revert). Runs outside Nest's DI, so env vars are loaded directly here
// rather than through ConfigModule — same file precedence Nest uses
// (app.module.ts), first file wins.
//
// In production, invoke the compiled form directly rather than through
// `pnpm run migration:run` — the deployed image is a pruned `pnpm deploy`
// output with no src/ and an unresolved workspace:* reference, so any
// `pnpm run <script>` fails its pre-run dependency check there before the
// script body even executes. The working command, verified against the
// actual built image: `node_modules/.bin/typeorm-ts-node-commonjs
// migration:run -d dist/database/data-source.js` (same pattern as
// seed.ts's `node dist/database/seed.js`).
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

// Guards against a resolved URL pointing somewhere unintended; only the
// deploy pipeline sets ALLOW_PROD_MIGRATION.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);
if (!LOCAL_HOSTS.has(new URL(url).hostname) && process.env.ALLOW_PROD_MIGRATION !== 'true') {
  throw new Error('Refusing migration against a non-local host. Set ALLOW_PROD_MIGRATION=true if intentional.');
}

export default new DataSource(buildDataSourceOptions(url));
