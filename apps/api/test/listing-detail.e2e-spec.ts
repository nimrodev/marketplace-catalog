import { DataSource } from 'typeorm';
import { UserRole } from '@marketplace/shared';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { Listing } from '../src/listings/listing.entity';
import { ListingPhoto } from '../src/listings/listing-photo.entity';
import { ListingRisk } from '../src/listings/listing-risk.entity';
import { ListingsRepository, Viewer } from '../src/listings/listings.repository';

describe('Listing detail (e2e)', () => {
  let dataSource: DataSource;
  let repo: ListingsRepository;
  let contributorId: string;
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
      contributor_id: contributorId,
      ...overrides,
    };
    const [inserted] = await dataSource.query(
      `INSERT INTO listings
         (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    );

    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['listing-detail-test@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    contributorId = user.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listing_risk WHERE listing_id IN (SELECT id FROM listings WHERE contributor_id = $1)', [
      contributorId,
    ]);
    await dataSource.query('DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE contributor_id = $1)', [
      contributorId,
    ]);
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [contributorId]);
    await dataSource.destroy();
  });

  it('an anonymous viewer requesting a pending listing gets null (404 territory)', async () => {
    const id = await insertListing({ status: 'PENDING' });
    const detail = await repo.findDetail(id, anonymous);
    expect(detail).toBeNull();
  });

  it('an anonymous viewer requesting a published listing sees the full field set', async () => {
    const id = await insertListing({ status: 'PUBLISHED' });
    const detail = await repo.findDetail(id, anonymous);
    expect(detail).toMatchObject({
      id,
      description: expect.any(String),
      isNegotiable: false,
      status: 'PUBLISHED',
      contributorId,
    });
  });

  it('photos are returned ordered by sort_order regardless of insert order', async () => {
    const id = await insertListing({ status: 'PUBLISHED' });
    await dataSource.query(
      `INSERT INTO listing_photos (listing_id, s3_key, sort_order) VALUES ($1, 'photo-2', 2), ($1, 'photo-0', 0), ($1, 'photo-1', 1)`,
      [id],
    );
    const detail = await repo.findDetail(id, anonymous);
    expect(detail?.photos).toEqual([
      { url: 'photo-0', sortOrder: 0 },
      { url: 'photo-1', sortOrder: 1 },
      { url: 'photo-2', sortOrder: 2 },
    ]);
  });

  it('risk data never reaches a non-moderator response — anonymous', async () => {
    const id = await insertListing({ status: 'PUBLISHED' });
    await dataSource.query(
      `INSERT INTO listing_risk (listing_id, level, reasons, flags, model, evaluated_at) VALUES ($1, 'HIGH', '{}', '{}', 'test-model', now())`,
      [id],
    );
    const detail = await repo.findDetail(id, anonymous);
    expect(detail?.risk).toBeNull();
  });

  it('risk data never reaches a non-moderator response — owning contributor', async () => {
    const id = await insertListing({ status: 'PENDING' });
    await dataSource.query(
      `INSERT INTO listing_risk (listing_id, level, reasons, flags, model, evaluated_at) VALUES ($1, 'HIGH', '{}', '{}', 'test-model', now())`,
      [id],
    );
    const detail = await repo.findDetail(id, { role: UserRole.CONTRIBUTOR, userId: contributorId });
    expect(detail?.risk).toBeNull();
  });

  it('a moderator sees risk data', async () => {
    const id = await insertListing({ status: 'PENDING' });
    await dataSource.query(
      `INSERT INTO listing_risk (listing_id, level, reasons, flags, model, evaluated_at) VALUES ($1, 'HIGH', ARRAY['reason'], ARRAY['flag'], 'test-model', now())`,
      [id],
    );
    const detail = await repo.findDetail(id, moderator);
    expect(detail?.risk).toMatchObject({ level: 'HIGH', reasons: ['reason'], flags: ['flag'], model: 'test-model' });
  });

  it('a listing with no risk row yet returns risk: null for a moderator (not an error)', async () => {
    const id = await insertListing({ status: 'PENDING' });
    const detail = await repo.findDetail(id, moderator);
    expect(detail?.risk).toBeNull();
  });
});
