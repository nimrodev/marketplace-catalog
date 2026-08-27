// Standalone entry point, same env-loading pattern as data-source.ts —
// runs outside Nest's DI both locally (`pnpm build && pnpm seed`) and in
// production, run once by hand after first deploy, never as part of CD.
//
// Production invocation is `docker compose exec api node dist/database/
// seed.js`, NOT `pnpm seed` — the deployed image is a `pnpm deploy --prod
// --legacy` output, whose package.json keeps workspace:* dependency
// specifiers unresolved. `pnpm run <anything>` there fails its pre-run
// dependency-status check before the script body even executes; verified
// live against the actual built production image, not assumed.

import { config } from 'dotenv';
config({ path: '../../.env.local' });
config({ path: '.env' });

import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
  ListingCategory,
  ListingCondition,
  ListingOption,
  ListingStatus,
  UserRole,
} from '@marketplace/shared';
import { buildDataSourceOptions } from './data-source-options';
import { CATEGORY_PROFILES } from './seed-catalog-data';

const TOTAL_LISTINGS = 1000;
const CATEGORIES = Object.values(ListingCategory);
const CONDITIONS = Object.values(ListingCondition);
const OPTIONS = Object.values(ListingOption);

// Demo credentials — deliberately not secret (this is public seed data for
// a graded take-home, not a real production system). Documented here and
// printed on every run so they're never just "remembered."
const SEED_PASSWORD = 'Password123!';
const SEED_USERS = [
  { email: 'admin@marketplace.test', role: UserRole.ADMIN },
  { email: 'moderator@marketplace.test', role: UserRole.MODERATOR },
  { email: 'contributor1@marketplace.test', role: UserRole.CONTRIBUTOR },
  { email: 'contributor2@marketplace.test', role: UserRole.CONTRIBUTOR },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickStatus(): ListingStatus {
  const roll = Math.random();
  if (roll < 0.85) return ListingStatus.PUBLISHED;
  if (roll < 0.95) return ListingStatus.PENDING;
  return ListingStatus.REJECTED;
}

const REJECTION_REASONS = [
  'Photos do not match the description.',
  'Price appears inconsistent with the described condition.',
  'Description is too vague to review — please add more detail.',
  'Listing appears to duplicate an existing one.',
];

async function seedUsers(dataSource: DataSource): Promise<Record<string, string>> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const ids: Record<string, string> = {};
  for (const user of SEED_USERS) {
    const [row] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`,
      [user.email, passwordHash, user.role],
    );
    ids[user.email] = row.id;
  }
  return ids;
}

function buildListing(contributorId: string) {
  const category = pick(CATEGORIES);
  const condition = pick(CONDITIONS);
  const profile = CATEGORY_PROFILES[category];
  const item = pick(profile.items);
  const variant = pick(item.variants);
  const title = `${item.name} — ${variant}`.slice(0, 120);
  const description = profile.descriptionTemplate(item.name, condition);
  const [min, max] = item.priceRange;
  const price = Number(faker.commerce.price({ min, max, dec: 2 }));

  const isNegotiable = Math.random() < 0.3;
  const minPrice = isNegotiable ? Number((price * faker.number.float({ min: 0.6, max: 0.9 })).toFixed(2)) : null;

  const status = pickStatus();
  const rejectionReason = status === ListingStatus.REJECTED ? pick(REJECTION_REASONS) : null;
  const publishedAt = status === ListingStatus.PUBLISHED ? faker.date.recent({ days: 90 }) : null;

  const optionCount = faker.number.int({ min: 0, max: 3 });
  const options = faker.helpers.arrayElements(OPTIONS, optionCount);

  return {
    title,
    description,
    price,
    condition,
    category,
    is_negotiable: isNegotiable,
    min_price: minPrice,
    options,
    status,
    rejection_reason: rejectionReason,
    contributor_id: contributorId,
    published_at: publishedAt,
  };
}

async function seedListings(dataSource: DataSource, contributorIds: string[]): Promise<void> {
  const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM listings');
  if (count > 0) {
    console.log(`listings table already has ${count} rows — skipping (idempotent, not re-seeding).`);
    return;
  }

  const BATCH_SIZE = 100;
  for (let start = 0; start < TOTAL_LISTINGS; start += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, TOTAL_LISTINGS - start) }, () =>
      buildListing(pick(contributorIds)),
    );

    const listingIds: string[] = await dataSource.transaction(async (manager) => {
      const ids: string[] = [];
      for (const row of batch) {
        const [inserted] = await manager.query(
          `INSERT INTO listings
             (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            row.title,
            row.description,
            row.price,
            row.condition,
            row.category,
            row.is_negotiable,
            row.min_price,
            row.options,
            row.status,
            row.rejection_reason,
            row.contributor_id,
            row.published_at,
          ],
        );
        ids.push(inserted.id);

        const photoCount = faker.number.int({ min: 1, max: 3 });
        for (let sortOrder = 0; sortOrder < photoCount; sortOrder++) {
          await manager.query('INSERT INTO listing_photos (listing_id, s3_key, sort_order) VALUES ($1, $2, $3)', [
            inserted.id,
            `https://picsum.photos/seed/${inserted.id}-${sortOrder}/800/600`,
            sortOrder,
          ]);
        }
      }
      return ids;
    });

    console.log(`seeded listings ${start + 1}-${start + listingIds.length} / ${TOTAL_LISTINGS}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set to seed the database.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(url));
  await dataSource.initialize();

  try {
    const userIds = await seedUsers(dataSource);
    const contributorIds = SEED_USERS.filter((u) => u.role === UserRole.CONTRIBUTOR).map(
      (u) => userIds[u.email],
    );
    await seedListings(dataSource, contributorIds);

    console.log('\nSeed complete. Demo credentials (all users share one password):');
    console.log(`  password: ${SEED_PASSWORD}`);
    for (const user of SEED_USERS) {
      console.log(`  ${user.role.padEnd(11)} ${user.email}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
