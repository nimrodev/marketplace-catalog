import { DataSource } from 'typeorm';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { Listing } from '../src/listings/listing.entity';
import { ListingPhoto } from '../src/listings/listing-photo.entity';
import { ListingRisk } from '../src/listings/listing-risk.entity';
import { CATALOG_LIMIT, ListingsRepository } from '../src/listings/listings.repository';
import { fakeConfigService } from './support/fake-config-service';

describe('Catalog query (e2e)', () => {
  let dataSource: DataSource;
  let repo: ListingsRepository;
  let contributorId: string;

  async function insertListing(overrides: Record<string, unknown>): Promise<string> {
    const row = {
      title: 'A valid listing title',
      description: 'A description long enough to pass the layer-1 length rule.',
      price: 100,
      condition: ListingCondition.GOOD,
      category: ListingCategory.OTHER,
      is_negotiable: false,
      min_price: null,
      options: [],
      status: ListingStatus.PUBLISHED,
      rejection_reason: null,
      contributor_id: contributorId,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
    const [inserted] = await dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        row.created_at,
        row.updated_at,
      ],
    );
    return inserted.id;
  }

  async function explain(sql: string, params: unknown[] = []): Promise<string> {
    const rows = await dataSource.query(`EXPLAIN ${sql}`, params);
    return rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL!));
    await dataSource.initialize();
    repo = new ListingsRepository(
      dataSource.getRepository(Listing),
      dataSource.getRepository(ListingPhoto),
      dataSource.getRepository(ListingRisk),
      fakeConfigService(),
    );

    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['catalog-query-test@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    contributorId = user.id;

    // Bulk rows for the EXPLAIN test — needs real volume for the planner
    // to prefer an index scan (same technique as MAR-9's index test).
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      title: `Bulk listing ${i}`,
      description: 'Synthetic row for EXPLAIN volume only.',
      price: Number((Math.random() * 2000 + 1).toFixed(2)),
      condition: ListingCondition.GOOD,
      category: ListingCategory.OTHER,
      is_negotiable: false,
      min_price: null,
      options: [],
      status: ListingStatus.PUBLISHED,
      rejection_reason: null,
      contributor_id: contributorId,
    }));
    const values: string[] = [];
    const params: unknown[] = [];
    rows.forEach((row, i) => {
      const base = i * 10;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, false, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`,
      );
      params.push(
        row.title,
        row.description,
        row.price,
        row.condition,
        row.category,
        row.min_price,
        row.options,
        row.status,
        row.rejection_reason,
        row.contributor_id,
      );
    });
    await dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ${values.join(', ')}`,
      params,
    );
    await dataSource.query('ANALYZE listings');
  }, 30_000);

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [contributorId]);
    await dataSource.destroy();
  });

  describe('pagination stability', () => {
    it('a new listing published mid-scroll causes no duplicates and no skips on the next page', async () => {
      // Far in the future so these sort above the bulk rows (inserted
      // with updated_at defaulting to now()) regardless of the actual
      // current date.
      const base = Date.parse('2999-06-01T00:00:00.000Z');
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(await insertListing({ title: `Stability ${i}`, updated_at: new Date(base + i * 1000) }));
      }
      // ids[9] is newest (updated_at = base+9000ms) -> first page.

      const page1 = await repo.findCatalogPage({ limit: 4 });
      const page1Ids = page1.items.filter((l) => ids.includes(l.id)).map((l) => l.id);
      expect(page1Ids).toEqual([ids[9], ids[8], ids[7], ids[6]]);
      expect(page1.nextCursor).not.toBeNull();

      // Simulate a new listing published while the user is on page 1 —
      // it lands at the head of the ordering, newer than everything.
      const newHeadId = await insertListing({ title: 'Published mid-scroll', updated_at: new Date(base + 20_000) });

      const page2 = await repo.findCatalogPage({ limit: 4, cursor: page1.nextCursor! });
      const page2Ids = page2.items.filter((l) => ids.includes(l.id)).map((l) => l.id);

      expect(page2Ids).toEqual([ids[5], ids[4], ids[3], ids[2]]);
      expect(page2.items.some((l) => l.id === newHeadId)).toBe(false);
      expect(page2Ids.some((id) => page1Ids.includes(id))).toBe(false);
    });
  });

  describe('limit clamping', () => {
    it('defaults to CATALOG_LIMIT.default when limit is omitted', async () => {
      const page = await repo.findCatalogPage({});
      expect(page.items.length).toBeLessThanOrEqual(CATALOG_LIMIT.default);
    });

    it('clamps a limit above the cap instead of honouring it', async () => {
      const page = await repo.findCatalogPage({ limit: 10_000 });
      expect(page.items.length).toBeLessThanOrEqual(CATALOG_LIMIT.max);
    });

    it('clamps a non-positive limit to the default rather than erroring', async () => {
      const page = await repo.findCatalogPage({ limit: -5 });
      expect(page.items.length).toBeLessThanOrEqual(CATALOG_LIMIT.default);
    });
  });

  describe('filters', () => {
    let electronicsId: string;
    let furnitureId: string;
    let cheapId: string;
    let expensiveId: string;
    let negotiableId: string;
    let deliveryOptionId: string;
    let pendingMarkerId: string;
    let rejectedMarkerId: string;

    beforeAll(async () => {
      electronicsId = await insertListing({ title: 'Filter: electronics', category: ListingCategory.ELECTRONICS });
      furnitureId = await insertListing({ title: 'Filter: furniture', category: ListingCategory.FURNITURE });
      cheapId = await insertListing({ title: 'Filter: cheap', price: 5 });
      expensiveId = await insertListing({ title: 'Filter: expensive', price: 9999 });
      negotiableId = await insertListing({
        title: 'Filter: negotiable',
        is_negotiable: true,
        min_price: 50,
        price: 100,
      });
      deliveryOptionId = await insertListing({
        title: 'Filter: delivery option',
        options: [ListingOption.DELIVERY_AVAILABLE],
      });
      pendingMarkerId = await insertListing({ title: 'Filter: pending marker', status: ListingStatus.PENDING });
      rejectedMarkerId = await insertListing({
        title: 'Filter: rejected marker',
        status: ListingStatus.REJECTED,
        rejection_reason: 'x',
      });
    });

    async function idsFor(query: Parameters<ListingsRepository['findCatalogPage']>[0]): Promise<string[]> {
      const page = await repo.findCatalogPage({ ...query, limit: 50 });
      return page.items.map((l) => l.id);
    }

    it('category filter returns only matching listings', async () => {
      const ids = await idsFor({ category: ListingCategory.ELECTRONICS });
      expect(ids).toContain(electronicsId);
      expect(ids).not.toContain(furnitureId);
    });

    it('minPrice/maxPrice filter returns only listings within range', async () => {
      const ids = await idsFor({ minPrice: 1000, maxPrice: 20000 });
      expect(ids).toContain(expensiveId);
      expect(ids).not.toContain(cheapId);
    });

    it('negotiable filter returns only negotiable listings', async () => {
      const ids = await idsFor({ negotiable: true });
      expect(ids).toContain(negotiableId);
      expect(ids).not.toContain(cheapId);
    });

    it('options filter (array containment) returns only listings with that option', async () => {
      const ids = await idsFor({ options: [ListingOption.DELIVERY_AVAILABLE] });
      expect(ids).toContain(deliveryOptionId);
      expect(ids).not.toContain(cheapId);
    });

    it('combined filters are AND-composed', async () => {
      const combinedId = await insertListing({
        title: 'Filter: combined match',
        category: ListingCategory.ELECTRONICS,
        price: 500,
        condition: ListingCondition.NEW,
      });
      const ids = await idsFor({ category: ListingCategory.ELECTRONICS, condition: ListingCondition.NEW, minPrice: 100, maxPrice: 1000 });
      expect(ids).toContain(combinedId);
      expect(ids).not.toContain(cheapId);
      expect(ids).not.toContain(furnitureId);
    });

    it('status filter, scoped to "mine", narrows to that status', async () => {
      // idsFor never passes mineUserId — the "mine" branch is the only
      // place a status filter does useful work, so it's exercised directly.
      const page = await repo.findCatalogPage({ status: ListingStatus.REJECTED, limit: 50 }, contributorId);
      const mineIds = page.items.map((l) => l.id);
      expect(mineIds).toContain(rejectedMarkerId);
      expect(mineIds).not.toContain(pendingMarkerId);
    });

    it('status filter without "mine" matches nothing outside PUBLISHED — no leak via the new field', async () => {
      const ids = await idsFor({ status: ListingStatus.REJECTED });
      expect(ids).not.toContain(rejectedMarkerId);
    });

    it('rejectionReason is carried on the summary for a rejected listing, null for everything else', async () => {
      const page = await repo.findCatalogPage({ limit: 50 }, contributorId);
      expect(page.items.find((l) => l.id === rejectedMarkerId)?.rejectionReason).toBe('x');
      expect(page.items.find((l) => l.id === cheapId)?.rejectionReason).toBeNull();
    });

    it('an unpublished listing never appears, under any filter combination', async () => {
      const combos: Parameters<ListingsRepository['findCatalogPage']>[0][] = [
        {},
        { category: ListingCategory.OTHER },
        { minPrice: 0, maxPrice: 100000 },
        { negotiable: false },
        { options: [] },
      ];
      for (const query of combos) {
        const ids = await idsFor(query);
        expect(ids).not.toContain(pendingMarkerId);
        expect(ids).not.toContain(rejectedMarkerId);
      }
    });
  });

  describe('EXPLAIN — cursor continuation', () => {
    it('the keyset cursor predicate uses the partial catalog index, not a sequential scan', async () => {
      const plan = await explain(
        `SELECT * FROM listings
         WHERE status = 'PUBLISHED' AND deleted_at IS NULL
           AND (updated_at, id) < ($1, $2)
         ORDER BY updated_at DESC, id DESC LIMIT 24`,
        ['2026-01-01T00:00:00.000000Z', '00000000-0000-0000-0000-000000000000'],
      );
      expect(plan).toContain('IDX_listings_catalog_keyset');
      expect(plan).not.toMatch(/Seq Scan/);
    });
  });
});
