import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { RiskLevel } from '@marketplace/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const PASSWORD = 'CorrectPass1!';

describe('GET /moderation/queue (e2e)', () => {
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
      const email = `moderation-queue-e2e-${key}@example.com`;
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
    await dataSource.query('DELETE FROM listing_risk WHERE listing_id IN (SELECT id FROM listings WHERE contributor_id = $1)', [
      contributorId,
    ]);
    await dataSource.query('DELETE FROM listings WHERE contributor_id = $1', [contributorId]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await app.close();
  });

  async function insertPendingListing(title: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const row = {
      title,
      description: 'A description long enough to pass the layer-1 length rule.',
      price: 100,
      condition: 'GOOD',
      category: 'OTHER',
      is_negotiable: false,
      min_price: null,
      options: [],
      status: 'PENDING',
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

  async function insertRisk(listingId: string, level: RiskLevel): Promise<void> {
    await dataSource.query(
      `INSERT INTO listing_risk (listing_id, level, reasons, flags, model, evaluated_at) VALUES ($1, $2, '{}', '{}', 'test-model', now())`,
      [listingId, level],
    );
  }

  it('a contributor gets 403', async () => {
    await request(app.getHttpServer()).get('/api/moderation/queue').set('Cookie', cookies.contributor).expect(403);
  });

  it('high-risk listings appear first, and a listing with no risk record still appears', async () => {
    const low = await insertPendingListing('Queue order — low risk item');
    await insertRisk(low, RiskLevel.LOW);
    const unassessed = await insertPendingListing('Queue order — unassessed item');
    const high = await insertPendingListing('Queue order — high risk item');
    await insertRisk(high, RiskLevel.HIGH);

    const res = await request(app.getHttpServer()).get('/api/moderation/queue').set('Cookie', cookies.moderator).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);

    expect(ids.indexOf(high)).toBeLessThan(ids.indexOf(low));
    expect(ids).toContain(unassessed);
    const unassessedItem = res.body.items.find((i: { id: string }) => i.id === unassessed);
    expect(unassessedItem.risk).toBeNull();
  });

  it('within the same risk tier, the most recently submitted listing appears first', async () => {
    const older = await insertPendingListing('Queue order — older unassessed item');
    const newer = await insertPendingListing('Queue order — newer unassessed item');

    const res = await request(app.getHttpServer()).get('/api/moderation/queue').set('Cookie', cookies.moderator).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);

    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  });

  it('a published listing never appears in the queue', async () => {
    const id = await insertPendingListing('Published listing excluded from queue', { status: 'PUBLISHED' });
    const res = await request(app.getHttpServer()).get('/api/moderation/queue').set('Cookie', cookies.moderator).expect(200);
    expect(res.body.items.some((i: { id: string }) => i.id === id)).toBe(false);
  });

  it('?risk=high filters to only high-risk items', async () => {
    const low = await insertPendingListing('Risk filter — low');
    await insertRisk(low, RiskLevel.LOW);
    const high = await insertPendingListing('Risk filter — high');
    await insertRisk(high, RiskLevel.HIGH);

    const res = await request(app.getHttpServer())
      .get('/api/moderation/queue')
      .query({ risk: RiskLevel.HIGH })
      .set('Cookie', cookies.moderator)
      .expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(high);
    expect(ids).not.toContain(low);
  });

  it('an invalid cursor 400s rather than 500ing', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/queue')
      .query({ cursor: 'not-a-valid-cursor!!' })
      .set('Cookie', cookies.moderator)
      .expect(400);
  });
});
