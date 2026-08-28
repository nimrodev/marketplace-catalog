import { DataSource } from 'typeorm';
import { UserRole } from '@marketplace/shared';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { Listing } from '../src/listings/listing.entity';
import { ListingPhoto } from '../src/listings/listing-photo.entity';
import { ListingRisk } from '../src/listings/listing-risk.entity';
import { ListingsRepository, Viewer } from '../src/listings/listings.repository';
import { fakeConfigService } from './support/fake-config-service';

// The leak test (MAR-15): findVisibleById returns Listing | null, so
// there's no code path to signal "exists but hidden" vs. "doesn't
// exist" — that's what rules out a 403 leak.
describe('Listing visibility scoping (e2e)', () => {
  let dataSource: DataSource;
  let repo: ListingsRepository;
  let ownerId: string;
  let otherContributorId: string;

  const anonymous: Viewer = { role: null };
  const moderator: Viewer = { role: UserRole.MODERATOR };

  async function insertListing(overrides: Record<string, unknown>): Promise<string> {
    const row = {
      title: 'A valid listing title',
      description: 'A description long enough to pass the layer-1 length rule.',
      price: 100,
      condition: 'GOOD',
      category: 'OTHER',
      is_negotiable: false,
      min_price: null,
      options: [],
      status: 'PUBLISHED',
      rejection_reason: null,
      contributor_id: ownerId,
      deleted_at: null,
      ...overrides,
    };
    const [inserted] = await dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id, deleted_at)
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
        row.deleted_at,
      ],
    );
    return inserted.id;
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

    const [owner] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['visibility-owner@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    ownerId = owner.id;
    const [other] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['visibility-other@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    otherContributorId = other.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id IN ($1, $2)', [ownerId, otherContributorId]);
    await dataSource.query('DELETE FROM users WHERE id IN ($1, $2)', [ownerId, otherContributorId]);
    await dataSource.destroy();
  });

  it('anonymous can fetch a published, non-deleted listing (control case)', async () => {
    const id = await insertListing({ status: 'PUBLISHED' });
    const found = await repo.findVisibleById(id, anonymous);
    expect(found?.id).toBe(id);
  });

  it('anonymous fetching a PENDING listing by exact ID gets null', async () => {
    const id = await insertListing({ status: 'PENDING' });
    const found = await repo.findVisibleById(id, anonymous);
    expect(found).toBeNull();
  });

  it('anonymous fetching a REJECTED listing by exact ID gets null', async () => {
    const id = await insertListing({ status: 'REJECTED', rejection_reason: 'Prohibited item' });
    const found = await repo.findVisibleById(id, anonymous);
    expect(found).toBeNull();
  });

  it('anonymous fetching a soft-deleted (but published) listing by exact ID gets null', async () => {
    const id = await insertListing({ status: 'PUBLISHED', deleted_at: new Date() });
    const found = await repo.findVisibleById(id, anonymous);
    expect(found).toBeNull();
  });

  it('anonymous fetching a nonexistent ID gets null', async () => {
    const found = await repo.findVisibleById('00000000-0000-0000-0000-000000000000', anonymous);
    expect(found).toBeNull();
  });

  it('a contributor can fetch their own pending listing', async () => {
    const id = await insertListing({ status: 'PENDING', contributor_id: ownerId });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: ownerId });
    expect(found?.id).toBe(id);
  });

  it('another contributor cannot fetch someone else\'s pending listing', async () => {
    const id = await insertListing({ status: 'PENDING', contributor_id: ownerId });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: otherContributorId });
    expect(found).toBeNull();
  });

  it('another contributor cannot fetch someone else\'s rejected listing', async () => {
    const id = await insertListing({ status: 'REJECTED', rejection_reason: 'x', contributor_id: ownerId });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: otherContributorId });
    expect(found).toBeNull();
  });

  it('a contributor can still see any published listing regardless of owner', async () => {
    const id = await insertListing({ status: 'PUBLISHED', contributor_id: ownerId });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: otherContributorId });
    expect(found?.id).toBe(id);
  });

  it('a contributor can fetch their own REJECTED listing', async () => {
    const id = await insertListing({ status: 'REJECTED', rejection_reason: 'x', contributor_id: ownerId });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: ownerId });
    expect(found?.id).toBe(id);
  });

  it('a contributor cannot fetch their own soft-deleted listing', async () => {
    const id = await insertListing({ status: 'PUBLISHED', contributor_id: ownerId, deleted_at: new Date() });
    const found = await repo.findVisibleById(id, { role: UserRole.CONTRIBUTOR, userId: ownerId });
    expect(found).toBeNull();
  });

  it('an admin can fetch a pending listing', async () => {
    const id = await insertListing({ status: 'PENDING' });
    const found = await repo.findVisibleById(id, { role: UserRole.ADMIN });
    expect(found?.id).toBe(id);
  });

  it('a moderator can fetch a pending listing', async () => {
    const id = await insertListing({ status: 'PENDING' });
    const found = await repo.findVisibleById(id, moderator);
    expect(found?.id).toBe(id);
  });

  it('a moderator can fetch a rejected listing', async () => {
    const id = await insertListing({ status: 'REJECTED', rejection_reason: 'x' });
    const found = await repo.findVisibleById(id, moderator);
    expect(found?.id).toBe(id);
  });

  it('a moderator can fetch a soft-deleted listing', async () => {
    const id = await insertListing({ status: 'PUBLISHED', deleted_at: new Date() });
    const found = await repo.findVisibleById(id, moderator);
    expect(found?.id).toBe(id);
  });
});
