import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { ListingCategory } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

// Confirms the actual Nest wiring (module, DI, controller route) works —
// every other catalog-query test calls ListingsRepository directly and
// never exercises this.
describe('GET /listings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contributorId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      ['listings-controller-test@example.com', 'irrelevant', 'CONTRIBUTOR'],
    );
    contributorId = user.id;
    await dataSource.query(
      `INSERT INTO listings (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ('Controller smoke test listing', 'A description long enough to pass the layer-1 length rule.', 42, 'GOOD', 'ELECTRONICS', false, null, '{}', 'PUBLISHED', null, $1)`,
      [contributorId],
    );
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [contributorId]);
    await app.close();
  });

  it('returns a page shaped { items, nextCursor }', async () => {
    const res = await request(app.getHttpServer()).get('/api/listings').expect(200);
    expect(res.body.items).toEqual(expect.any(Array));
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body.items.some((item: { title: string }) => item.title === 'Controller smoke test listing')).toBe(
      true,
    );
  });

  it('applies the category filter through the real HTTP query string', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/listings')
      .query({ category: ListingCategory.FURNITURE })
      .expect(200);
    expect(res.body.items.some((item: { title: string }) => item.title === 'Controller smoke test listing')).toBe(
      false,
    );
  });

  it('400s on an invalid cursor rather than 500ing', async () => {
    await request(app.getHttpServer()).get('/api/listings').query({ cursor: 'not-a-valid-cursor!!' }).expect(400);
  });

  it('400s on an invalid enum filter value', async () => {
    await request(app.getHttpServer()).get('/api/listings').query({ category: 'NOT_A_REAL_CATEGORY' }).expect(400);
  });

  it('clamps limit above the cap instead of 500ing or honouring it', async () => {
    const res = await request(app.getHttpServer()).get('/api/listings').query({ limit: 10_000 }).expect(200);
    expect(res.body.items.length).toBeLessThanOrEqual(50);
  });

  it('400s on a non-numeric limit rather than silently falling back to the default', async () => {
    await request(app.getHttpServer()).get('/api/listings').query({ limit: 'abc' }).expect(400);
  });
});
