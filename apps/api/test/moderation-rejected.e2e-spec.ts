import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const PASSWORD = 'CorrectPass1!';

describe('GET /moderation/rejected (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contributorId: string;
  const userIds: string[] = [];
  const cookies: Record<'contributor' | 'moderator', string> = { contributor: '', moderator: '' };

  beforeAll(async () => {
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
      const email = `moderation-rejected-e2e-${key}@example.com`;
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
    contributorId = userIds[0];
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await app.close();
  });

  async function insertListing(title: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const row = {
      title,
      description: 'A description long enough to pass the layer-1 length rule.',
      price: 100,
      condition: 'GOOD',
      category: 'OTHER',
      is_negotiable: false,
      min_price: null,
      options: [],
      status: 'REJECTED',
      rejection_reason: 'Photos do not match the description.',
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

  it('a contributor gets 403', async () => {
    await request(app.getHttpServer()).get('/api/moderation/rejected').set('Cookie', cookies.contributor).expect(403);
  });

  it('an anonymous caller gets 401', async () => {
    await request(app.getHttpServer()).get('/api/moderation/rejected').expect(401);
  });

  it('returns a rejected listing with its reason, and excludes pending/published ones', async () => {
    const rejected = await insertListing('Rejected — visible in the record');
    const pending = await insertListing('Pending — must not appear', { status: 'PENDING', rejection_reason: null });
    const published = await insertListing('Published — must not appear', { status: 'PUBLISHED', rejection_reason: null });

    const res = await request(app.getHttpServer()).get('/api/moderation/rejected').set('Cookie', cookies.moderator).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(rejected);
    expect(ids).not.toContain(pending);
    expect(ids).not.toContain(published);

    const item = res.body.items.find((i: { id: string }) => i.id === rejected);
    expect(item.rejectionReason).toBe('Photos do not match the description.');
    expect(item.status).toBe('REJECTED');
    expect(typeof item.contributorEmail).toBe('string');
    expect(typeof item.rejectedAt).toBe('string');
  });

  it('the most recently rejected listing appears first', async () => {
    const older = await insertListing('Rejected order — older');
    const newer = await insertListing('Rejected order — newer');
    await dataSource.query(`UPDATE listings SET updated_at = now() + interval '1 hour' WHERE id = $1`, [newer]);

    const res = await request(app.getHttpServer()).get('/api/moderation/rejected').set('Cookie', cookies.moderator).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  });

  it('an invalid cursor 400s rather than 500ing', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/rejected')
      .query({ cursor: 'not-a-valid-cursor!!' })
      .set('Cookie', cookies.moderator)
      .expect(400);
  });
});
