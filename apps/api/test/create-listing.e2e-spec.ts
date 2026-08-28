import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { ListingPhoto } from '../src/listings/listing-photo.entity';

const PASSWORD = 'CorrectPass1!';

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

describe('POST /listings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let sendSpy: jest.SpyInstance;
  const userIds: string[] = [];
  const cookies: Record<'contributor' | 'moderator', string> = { contributor: '', moderator: '' };

  beforeAll(async () => {
    // Stub S3's network call only; no real AWS access in CI.
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
      const email = `create-listing-e2e-${key}@example.com`;
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

  it('401s for an anonymous caller', async () => {
    await request(app.getHttpServer()).post('/api/listings').send(validPayload()).expect(401);
  });

  it('201s for a contributor and persists a PENDING listing with the photo attached', async () => {
    const key = `listings/${userIds[0]}/00000000-0000-4000-8000-000000000001.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(validPayload({ photoKeys: [key] }))
      .expect(201);

    expect(res.body.status).toBe(ListingStatus.PENDING);
    expect(res.body.contributorId).toBe(userIds[0]);
    expect(res.body.photos).toEqual([{ url: key, sortOrder: 0 }]);

    const [row] = await dataSource.query('SELECT id, status FROM listings WHERE id = $1', [res.body.id]);
    expect(row).toMatchObject({ id: res.body.id, status: ListingStatus.PENDING });
  });

  it('a moderator creating a listing also lands in PENDING — no self-approval shortcut', async () => {
    const key = `listings/${userIds[1]}/00000000-0000-4000-8000-000000000002.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.moderator)
      .send(validPayload({ photoKeys: [key] }))
      .expect(201);

    expect(res.body.status).toBe(ListingStatus.PENDING);
  });

  it('rejects a client attempting to set status directly — 400, not silently ignored', async () => {
    await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send({ ...validPayload(), status: ListingStatus.PUBLISHED })
      .expect(400);
  });

  it('rejects a client attempting to set contributorId directly — 400, not silently ignored', async () => {
    await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send({ ...validPayload(), contributorId: userIds[1] })
      .expect(400);
  });

  it('rejects a photoKey under another user\'s prefix', async () => {
    await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(validPayload({ photoKeys: ['listings/someone-else/00000000-0000-4000-8000-000000000003.jpg'] }))
      .expect(400);
  });

  it('rejects hard-hit content outright — nothing is persisted', async () => {
    const key = `listings/${userIds[0]}/00000000-0000-4000-8000-000000000004.jpg`;
    await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(validPayload({ photoKeys: [key], description: 'Selling a rifle, barely used, great condition' }))
      .expect(400);

    const rows = await dataSource.query(`SELECT id FROM listing_photos WHERE s3_key = $1`, [key]);
    expect(rows).toHaveLength(0);
  });

  it('accepts and persists soft-hit content — flagged, not rejected', async () => {
    const key = `listings/${userIds[0]}/00000000-0000-4000-8000-000000000005.jpg`;
    const res = await request(app.getHttpServer())
      .post('/api/listings')
      .set('Cookie', cookies.contributor)
      .send(validPayload({ photoKeys: [key], description: 'Contact me at buyer.contact@example.com to arrange pickup' }))
      .expect(201);

    expect(res.body.status).toBe(ListingStatus.PENDING);
  });

  it('rolls back the listing insert if the photo insert fails — a real Postgres transaction, not a mocked one', async () => {
    // Only the photo write is intercepted; the listing write and the
    // transaction/rollback machinery around both are entirely real.
    const realSave = EntityManager.prototype.save;
    const saveSpy = jest
      .spyOn(EntityManager.prototype, 'save')
      .mockImplementation(function (this: EntityManager, ...args: unknown[]) {
        const entities = args.find((arg) => Array.isArray(arg)) as unknown[] | undefined;
        if (entities && entities[0] instanceof ListingPhoto) {
          return Promise.reject(new Error('simulated photo insert failure'));
        }
        return (realSave as (...a: unknown[]) => unknown).apply(this, args);
      });

    try {
      const key = `listings/${userIds[0]}/00000000-0000-4000-8000-00000000000a.jpg`;
      await request(app.getHttpServer())
        .post('/api/listings')
        .set('Cookie', cookies.contributor)
        .send(validPayload({ title: 'Rollback-proof unique listing title', photoKeys: [key] }))
        .expect(500);

      const rows = await dataSource.query('SELECT id FROM listings WHERE title = $1', ['Rollback-proof unique listing title']);
      expect(rows).toHaveLength(0);
    } finally {
      saveSpy.mockRestore();
    }
  });
});
