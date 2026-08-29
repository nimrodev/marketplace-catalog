import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const PASSWORD = 'CorrectPass1!';

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Vintage bicycle, great condition',
    description: 'A well-loved bicycle, barely used, ready for a new home.',
    price: 150,
    condition: ListingCondition.GOOD,
    category: ListingCategory.SPORTS_OUTDOORS,
    isNegotiable: false,
    options: [ListingOption.LOCAL_PICKUP],
    photoKeys: ['listings/PLACEHOLDER/00000000-0000-4000-8000-000000000000.jpg'],
    ...overrides,
  };
}

describe('POST /moderation/:id/approve, /reject (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let sendSpy: jest.SpyInstance;
  const userIds: string[] = [];
  const cookies: Record<'contributor' | 'moderator', string> = { contributor: '', moderator: '' };

  beforeAll(async () => {
    sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 2048,
      ContentType: 'image/jpeg',
    } as never);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    for (const [key, role] of [
      ['contributor', 'CONTRIBUTOR'],
      ['moderator', 'MODERATOR'],
    ] as const) {
      const email = `moderation-e2e-${key}@example.com`;
      const [row] = await dataSource.query(
        `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
        [email, passwordHash, role],
      );
      userIds.push(row.id);

      const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD });
      const setCookie = loginRes.headers['set-cookie'];
      const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      cookies[key] = header.split(';')[0];
    }
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE contributor_id = ANY($1))',
      [userIds],
    );
    await dataSource.query('DELETE FROM listings WHERE contributor_id = ANY($1)', [userIds]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await app.close();
    sendSpy.mockRestore();
  });

  async function createListing(overrides: Record<string, unknown> = {}): Promise<string> {
    const contributorId = userIds[0];
    const key = `listings/${contributorId}/${crypto.randomUUID()}.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(createPayload({ photoKeys: [key], ...overrides }))
      .expect(201);
    return res.body.id;
  }

  describe('approve', () => {
    it('a contributor gets 403', async () => {
      const id = await createListing();
      await request(app.getHttpServer())
        .post(`/api/moderation/${id}/approve`)
        .set('Cookie', cookies.contributor)
        .expect(403);
    });

    it('a moderator approving a PENDING listing publishes it, stamping publishedAt', async () => {
      const id = await createListing();
      const res = await request(app.getHttpServer())
        .post(`/api/moderation/${id}/approve`)
        .set('Cookie', cookies.moderator)
        .expect(201);

      expect(res.body.status).toBe(ListingStatus.PUBLISHED);
      const [row] = await dataSource.query('SELECT published_at FROM listings WHERE id = $1', [id]);
      expect(row.published_at).not.toBeNull();
    });

    it('approving an already-published listing is rejected by the state machine, not silently accepted', async () => {
      const id = await createListing();
      await request(app.getHttpServer()).post(`/api/moderation/${id}/approve`).set('Cookie', cookies.moderator).expect(201);

      await request(app.getHttpServer()).post(`/api/moderation/${id}/approve`).set('Cookie', cookies.moderator).expect(400);
    });

    it('an approved listing appears in the public catalog immediately afterwards', async () => {
      const id = await createListing({ title: 'Freshly approved catalog listing' });
      await request(app.getHttpServer()).post(`/api/moderation/${id}/approve`).set('Cookie', cookies.moderator).expect(201);

      const res = await request(app.getHttpServer()).get('/api/listings').expect(200);
      expect(res.body.items.some((item: { id: string }) => item.id === id)).toBe(true);
    });
  });

  describe('reject', () => {
    it('a contributor gets 403', async () => {
      const id = await createListing();
      await request(app.getHttpServer())
        .post(`/api/moderation/${id}/reject`)
        .set('Cookie', cookies.contributor)
        .send({ reason: 'Prohibited item listed for sale' })
        .expect(403);
    });

    it('rejecting without a reason is a 400', async () => {
      const id = await createListing();
      await request(app.getHttpServer()).post(`/api/moderation/${id}/reject`).set('Cookie', cookies.moderator).send({}).expect(400);
    });

    it('rejecting with a too-short reason is a 400', async () => {
      const id = await createListing();
      await request(app.getHttpServer())
        .post(`/api/moderation/${id}/reject`)
        .set('Cookie', cookies.moderator)
        .send({ reason: 'too short' })
        .expect(400);
    });

    it('a moderator rejecting a PENDING listing sets REJECTED and stores the reason, visible to the owner', async () => {
      const id = await createListing();
      const res = await request(app.getHttpServer())
        .post(`/api/moderation/${id}/reject`)
        .set('Cookie', cookies.moderator)
        .send({ reason: 'Prohibited item listed for sale' })
        .expect(201);

      expect(res.body.status).toBe(ListingStatus.REJECTED);
      expect(res.body.rejectionReason).toBe('Prohibited item listed for sale');

      const ownerView = await request(app.getHttpServer())
        .get(`/api/listings/${id}`)
        .set('Cookie', cookies.contributor)
        .expect(200);
      expect(ownerView.body.rejectionReason).toBe('Prohibited item listed for sale');
    });
  });
});
