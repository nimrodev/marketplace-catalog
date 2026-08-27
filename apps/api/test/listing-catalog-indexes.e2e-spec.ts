import { DataSource } from 'typeorm';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { buildDataSourceOptions } from '../src/database/data-source-options';

// Proves each index in MAR-9 is real (not speculative) and actually gets
// chosen by the planner for the query it exists to serve. Self-contained:
// generates its own ~1000 rows rather than depending on the MAR-11 seed
// having been run — this suite runs in CI too, against an empty Postgres
// service container, and an index scan is not meaningfully provable
// against a near-empty table (Postgres correctly prefers a sequential
// scan regardless of what indexes exist).
describe('Catalog indexes (e2e)', () => {
  let dataSource: DataSource;
  let contributorId: string;

  const ROW_COUNT = 1000;
  const STATUSES = [ListingStatus.PUBLISHED, ListingStatus.PENDING, ListingStatus.REJECTED];
  const CATEGORIES = Object.values(ListingCategory);
  const CONDITIONS = Object.values(ListingCondition);
  const OPTIONS = Object.values(ListingOption);

  async function explain(sql: string, params: unknown[] = []): Promise<string> {
    const rows = await dataSource.query(`EXPLAIN ${sql}`, params);
    return rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
  }

  function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL!));
    await dataSource.initialize();

    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('index-test@example.com', 'irrelevant', 'CONTRIBUTOR')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
    );
    contributorId = user.id;
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);

    // One bulk INSERT, not ROW_COUNT round trips — 1000 sequential inserts
    // is fine against local Docker Postgres (sub-millisecond latency) but
    // was actually run against real Neon once and blew through Jest's
    // default test timeout well before finishing, leaving ~10 orphaned
    // rows and a state the afterAll cleanup couldn't handle. Caught live,
    // not theoretical.
    const rows = Array.from({ length: ROW_COUNT }, (_, i) => {
      const status = pick(STATUSES);
      const price = Number((Math.random() * 2000 + 1).toFixed(2));
      const options = Array.from(
        new Set(Array.from({ length: Math.floor(Math.random() * 3) }, () => pick(OPTIONS))),
      );
      return {
        title: `Index test listing ${i}`,
        description: 'Synthetic row generated for index verification only.',
        price,
        condition: pick(CONDITIONS),
        category: pick(CATEGORIES),
        status,
        rejectionReason: status === 'REJECTED' ? 'Synthetic rejection for index testing.' : null,
        options,
      };
    });

    const values: string[] = [];
    const params: unknown[] = [];
    rows.forEach((row, i) => {
      const base = i * 9;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, false, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
      );
      params.push(
        row.title,
        row.description,
        row.price,
        row.condition,
        row.category,
        row.status,
        row.rejectionReason,
        contributorId,
        row.options,
      );
    });
    await dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, status, rejection_reason, contributor_id, options)
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

  it('the public catalog keyset query uses the partial catalog index', async () => {
    const plan = await explain(
      `SELECT * FROM listings WHERE status = 'PUBLISHED' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 20`,
    );
    expect(plan).toContain('IDX_listings_catalog_keyset');
    expect(plan).not.toMatch(/Seq Scan/);
  });

  it('category-filtered browse uses the status+category index', async () => {
    const plan = await explain(
      `SELECT * FROM listings WHERE status = 'PUBLISHED' AND category = 'ELECTRONICS' ORDER BY created_at DESC, id DESC LIMIT 20`,
    );
    expect(plan).toContain('IDX_listings_status_category_keyset');
    expect(plan).not.toMatch(/Seq Scan/);
  });

  it('"my listings" uses the contributor index', async () => {
    const plan = await explain(
      `SELECT id FROM listings WHERE contributor_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [contributorId],
    );
    expect(plan).toContain('IDX_listings_contributor_created');
    expect(plan).not.toMatch(/Seq Scan/);
  });

  // The options and price indexes are real and Postgres genuinely uses
  // them — proven below via a selective predicate and via forcing
  // enable_seqscan off — but at only ~1000 rows (the whole table is a
  // handful of pages, comfortably one sequential read) the planner
  // correctly prefers a plain sequential scan for common/unselective
  // predicates over either index, which is standard, expected Postgres
  // cost-based behavior, not a broken or unused index. Asserting "always
  // Index Scan here" would be the wrong claim to make.

  it('the options GIN index is real and used once enable_seqscan is off', async () => {
    await dataSource.query('SET enable_seqscan = off');
    try {
      const plan = await explain(
        `SELECT id FROM listings WHERE options @> ARRAY['LOCAL_PICKUP','DELIVERY_AVAILABLE']::listings_options_enum[]`,
      );
      expect(plan).toContain('IDX_listings_options_gin');
    } finally {
      await dataSource.query('SET enable_seqscan = on');
    }
  });

  it('the price index is chosen for a selective range', async () => {
    // A fixed range risks flaking against the random price distribution;
    // anchoring to the minimum guarantees very few matching rows (a
    // handful, at most) regardless of what actually got generated.
    const [{ min_price: minPrice }] = await dataSource.query(
      'SELECT min(price) AS min_price FROM listings WHERE contributor_id = $1',
      [contributorId],
    );
    const plan = await explain(`SELECT id FROM listings WHERE price <= $1`, [Number(minPrice) + 1]);
    expect(plan).toContain('IDX_listings_price');
  });
});
