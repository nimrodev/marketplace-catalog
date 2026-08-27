import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';

// Layer 3 (DB CHECK constraints) proof: each test attempts the exact
// violating insert against a real, migrated Postgres and asserts Postgres
// itself rejects it (SQLSTATE 23514, check_violation) — not TypeORM's or
// the DTO layer's validation, which don't exist for this yet.
describe('Listing CHECK constraints (e2e)', () => {
  let dataSource: DataSource;
  let userId: string;

  const validListing = () => ({
    title: 'A valid listing title',
    description: 'A description long enough to pass the (unrelated) layer-1 length rule.',
    price: 100,
    condition: 'GOOD',
    category: 'OTHER',
    is_negotiable: false,
    min_price: null as number | null,
    options: [],
    status: 'PENDING',
    rejection_reason: null as string | null,
    contributor_id: '',
  });

  async function insertListing(overrides: Partial<ReturnType<typeof validListing>>) {
    const row = { ...validListing(), contributor_id: userId, ...overrides };
    return dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
      ],
    );
  }

  async function expectCheckViolation(overrides: Partial<ReturnType<typeof validListing>>) {
    await expect(insertListing(overrides)).rejects.toMatchObject({ code: '23514' });
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL!));
    await dataSource.initialize();
    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['constraint-test@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    userId = user.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [userId]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    await dataSource.destroy();
  });

  it('accepts a fully valid row (control case — the schema is not overly strict)', async () => {
    await expect(insertListing({})).resolves.toBeDefined();
  });

  it('rejects price <= 0', async () => {
    await expectCheckViolation({ price: 0 });
    await expectCheckViolation({ price: -5 });
  });

  it('rejects min_price set while is_negotiable is false', async () => {
    await expectCheckViolation({ is_negotiable: false, min_price: 50 });
  });

  it('rejects min_price <= 0', async () => {
    await expectCheckViolation({ is_negotiable: true, min_price: 0 });
  });

  it('rejects min_price greater than price', async () => {
    await expectCheckViolation({ is_negotiable: true, price: 100, min_price: 150 });
  });

  it('rejects status REJECTED with no rejection_reason', async () => {
    await expectCheckViolation({ status: 'REJECTED', rejection_reason: null });
  });

  it('accepts status REJECTED with a rejection_reason', async () => {
    await expect(
      insertListing({ status: 'REJECTED', rejection_reason: 'Prohibited item' }),
    ).resolves.toBeDefined();
  });

  it('rejects a title shorter than 3 characters', async () => {
    await expectCheckViolation({ title: 'ab' });
  });

  it('rejects a title longer than 120 characters', async () => {
    await expectCheckViolation({ title: 'x'.repeat(121) });
  });
});
