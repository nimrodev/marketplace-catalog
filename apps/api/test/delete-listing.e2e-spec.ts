import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';
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

describe('DELETE /listings/:id (e2e)', () => {
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
      const email = `delete-listing-e2e-${key}@example.com`;
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

  async function createListing(): Promise<string> {
    const contributorId = userIds[0];
    const key = `listings/${contributorId}/${crypto.randomUUID()}.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(createPayload({ photoKeys: [key] }))
      .expect(201);
    return res.body.id;
  }

  it('a contributor gets 403', async () => {
    const id = await createListing();
    await request(app.getHttpServer()).delete(`/api/listings/${id}`).set('Cookie', cookies.contributor).expect(403);
  });

  it('a moderator soft-deletes a listing — the row survives, deleted_at is set', async () => {
    const id = await createListing();
    await request(app.getHttpServer()).delete(`/api/listings/${id}`).set('Cookie', cookies.moderator).expect(204);

    const [row] = await dataSource.query('SELECT deleted_at FROM listings WHERE id = $1', [id]);
    expect(row).toBeDefined();
    expect(row.deleted_at).not.toBeNull();
  });

  it('a soft-deleted listing 404s for every role, including the moderator who deleted it', async () => {
    const id = await createListing();
    await request(app.getHttpServer()).delete(`/api/listings/${id}`).set('Cookie', cookies.moderator).expect(204);

    await request(app.getHttpServer()).get(`/api/listings/${id}`).expect(404);
    await request(app.getHttpServer()).get(`/api/listings/${id}`).set('Cookie', cookies.contributor).expect(404);
    await request(app.getHttpServer()).get(`/api/listings/${id}`).set('Cookie', cookies.moderator).expect(404);
  });

  it('deleting an already-deleted listing is idempotent — 404, not a second 204', async () => {
    const id = await createListing();
    await request(app.getHttpServer()).delete(`/api/listings/${id}`).set('Cookie', cookies.moderator).expect(204);
    await request(app.getHttpServer()).delete(`/api/listings/${id}`).set('Cookie', cookies.moderator).expect(404);
  });

  it('a nonexistent id 404s', async () => {
    await request(app.getHttpServer())
      .delete('/api/listings/00000000-0000-0000-0000-000000000000')
      .set('Cookie', cookies.moderator)
      .expect(404);
  });
});
