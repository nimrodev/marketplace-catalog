import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { buildPhotoUrl } from '../src/uploads/photo-url';
import { fakeConfigService } from './support/fake-config-service';

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

describe('PATCH /listings/:id (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let sendSpy: jest.SpyInstance;
  const userIds: string[] = [];
  const cookies: Record<'contributor' | 'otherContributor' | 'moderator', string> = {
    contributor: '',
    otherContributor: '',
    moderator: '',
  };

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
      ['otherContributor', 'CONTRIBUTOR'],
      ['moderator', 'MODERATOR'],
    ] as const) {
      const email = `update-listing-e2e-${key}@example.com`;
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

  async function createListing(
    cookie: string,
    contributorId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const key = `listings/${contributorId}/${crypto.randomUUID()}.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookie)
      .send(createPayload({ photoKeys: [key], ...overrides }))
      .expect(201);
    return res.body.id;
  }

  async function publish(listingId: string): Promise<void> {
    await dataSource.query('UPDATE listings SET status = $2 WHERE id = $1', [listingId, ListingStatus.PUBLISHED]);
  }

  it('401s for an anonymous caller', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);
    await request(app.getHttpServer()).patch(`/api/listings/${id}`).send({ title: 'New title' }).expect(401);
  });

  it('403s a contributor editing another contributor\'s listing', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);
    await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.otherContributor)
      .send({ title: 'Hijacked title' })
      .expect(403);
  });

  it('404s for a listing that does not exist', async () => {
    await request(app.getHttpServer())
      .patch('/api/listings/00000000-0000-4000-8000-000000000099')
      .set('Cookie', cookies.contributor)
      .send({ title: 'New title' })
      .expect(404);
  });

  it('a contributor editing their own PUBLISHED listing reverts it to PENDING', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);
    await publish(id);

    const res = await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.contributor)
      .send({ title: 'Updated title after review' })
      .expect(200);

    expect(res.body.title).toBe('Updated title after review');
    expect(res.body.status).toBe(ListingStatus.PENDING);
  });

  it('a moderator editing a PUBLISHED listing leaves it PUBLISHED', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);
    await publish(id);

    const res = await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.moderator)
      .send({ title: 'Moderator tweak' })
      .expect(200);

    expect(res.body.status).toBe(ListingStatus.PUBLISHED);
  });

  it('rejects hard-hit content on edit — nothing is mutated', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);

    await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.contributor)
      .send({ description: 'Selling a rifle, barely used, great condition' })
      .expect(400);

    const [row] = await dataSource.query('SELECT description FROM listings WHERE id = $1', [id]);
    expect(row.description).not.toContain('rifle');
  });

  it('re-runs photo ownership validation for a replaced photo key under another prefix', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);

    await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.contributor)
      .send({ photoKeys: ['listings/someone-else/00000000-0000-4000-8000-000000000003.jpg'] })
      .expect(400);
  });

  it('replaces the full photo set when photoKeys is provided', async () => {
    const id = await createListing(cookies.contributor, userIds[0]);
    const newKey = `listings/${userIds[0]}/${crypto.randomUUID()}.jpg`;

    const res = await request(app.getHttpServer())
      .patch(`/api/listings/${id}`)
      .set('Cookie', cookies.contributor)
      .send({ photoKeys: [newKey] })
      .expect(200);

    expect(res.body.photos).toEqual([{ url: buildPhotoUrl(newKey, fakeConfigService()), key: newKey, sortOrder: 0 }]);
  });
});
