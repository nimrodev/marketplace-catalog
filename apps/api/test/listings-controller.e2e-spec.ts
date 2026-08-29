import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ListingCategory } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const PASSWORD = 'CorrectPass1!';

// Confirms the actual Nest wiring (module, DI, controller route) works —
// every other catalog-query test calls ListingsRepository directly and
// never exercises this.
describe('GET /listings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contributorId: string;
  let otherContributorId: string;
  let ownerCookie: string;
  let otherCookie: string;
  let publishedListingId: string;
  let pendingListingId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
      ['listings-controller-test@example.com', passwordHash, 'CONTRIBUTOR'],
    );
    contributorId = user.id;
    const [other] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
      ['listings-controller-test-other@example.com', passwordHash, 'CONTRIBUTOR'],
    );
    otherContributorId = other.id;

    for (const [email, setCookie] of [
      ['listings-controller-test@example.com', (c: string) => (ownerCookie = c)],
      ['listings-controller-test-other@example.com', (c: string) => (otherCookie = c)],
    ] as const) {
      const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD });
      const header = loginRes.headers['set-cookie'];
      setCookie(Array.isArray(header) ? header[0] : header);
    }
    const [published] = await dataSource.query(
      `INSERT INTO listings (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ('Controller smoke test listing', 'A description long enough to pass the layer-1 length rule.', 42, 'GOOD', 'ELECTRONICS', false, null, '{}', 'PUBLISHED', null, $1)
       RETURNING id`,
      [contributorId],
    );
    publishedListingId = published.id;
    const [pending] = await dataSource.query(
      `INSERT INTO listings (title, description, price, condition, category, is_negotiable, min_price, options, status, rejection_reason, contributor_id)
       VALUES ('Controller pending listing', 'A description long enough to pass the layer-1 length rule.', 42, 'GOOD', 'ELECTRONICS', false, null, '{}', 'PENDING', null, $1)
       RETURNING id`,
      [contributorId],
    );
    pendingListingId = pending.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [[contributorId, otherContributorId]]);
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

  describe('GET /listings?mine=true', () => {
    it('an anonymous caller gets 401', async () => {
      await request(app.getHttpServer()).get('/api/listings').query({ mine: 'true' }).expect(401);
    });

    it("returns the owner's own listings across every status, and nothing belonging to anyone else", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .query({ mine: 'true' })
        .set('Cookie', ownerCookie)
        .expect(200);
      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([publishedListingId, pendingListingId]));
    });

    it('a contributor with no listings of their own gets an empty page, not the owner\'s', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .query({ mine: 'true' })
        .set('Cookie', otherCookie)
        .expect(200);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('GET /listings/:id', () => {
    it('returns the full detail for a published listing, with photos and no risk', async () => {
      const res = await request(app.getHttpServer()).get(`/api/listings/${publishedListingId}`).expect(200);
      expect(res.body).toMatchObject({
        id: publishedListingId,
        description: expect.any(String),
        status: 'PUBLISHED',
        risk: null,
      });
      expect(res.body.photos).toEqual(expect.any(Array));
    });

    it('an anonymous viewer requesting a pending listing gets 404, not 403', async () => {
      await request(app.getHttpServer()).get(`/api/listings/${pendingListingId}`).expect(404);
    });

    it('the owning contributor sees their own pending listing — the real cookie resolves a real viewer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/listings/${pendingListingId}`)
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(res.body.id).toBe(pendingListingId);
    });

    it('a different contributor still gets 404 for someone else\'s pending listing', async () => {
      await request(app.getHttpServer())
        .get(`/api/listings/${pendingListingId}`)
        .set('Cookie', otherCookie)
        .expect(404);
    });

    it('a nonexistent (but well-formed) id gets 404', async () => {
      await request(app.getHttpServer()).get('/api/listings/00000000-0000-0000-0000-000000000000').expect(404);
    });

    it('a malformed id 400s rather than 500ing', async () => {
      await request(app.getHttpServer()).get('/api/listings/not-a-uuid').expect(400);
    });
  });
});
