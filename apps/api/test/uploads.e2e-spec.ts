import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const PASSWORD = 'CorrectPass1!';

describe('Uploads (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userId: string;
  let cookie: string;
  let rateLimitUserId: string;
  let rateLimitCookie: string;
  const email = 'uploads-e2e@example.com';
  const rateLimitEmail = 'uploads-e2e-ratelimit@example.com';

  async function createLoggedInUser(userEmail: string, passwordHash: string): Promise<{ id: string; cookie: string }> {
    const [row] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'CONTRIBUTOR', true) RETURNING id`,
      [userEmail, passwordHash],
    );
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userEmail, password: PASSWORD });
    const setCookie = loginRes.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    return { id: row.id, cookie: header.split(';')[0] };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const main = await createLoggedInUser(email, passwordHash);
    userId = main.id;
    cookie = main.cookie;

    // Separate user so this suite's other requests don't eat into the
    // rate-limit test's own budget — the throttler tracks per user id.
    const limited = await createLoggedInUser(rateLimitEmail, passwordHash);
    rateLimitUserId = limited.id;
    rateLimitCookie = limited.cookie;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [[userId, rateLimitUserId]]);
    await app.close();
  });

  describe('POST /uploads/presign', () => {
    it('401s for an anonymous caller — protected by the global guard, not opted out', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .send({ contentType: 'image/jpeg', contentLength: 1024 })
        .expect(401);
    });

    it('returns a signed URL and a key scoped to the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'image/jpeg', contentLength: 1024 })
        .expect(200);

      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(0);
      expect(res.body.key).toMatch(new RegExp(`^listings/${userId}/[0-9a-f-]+\\.jpg$`));
    });

    it('400s on a disallowed content type', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'application/pdf', contentLength: 1024 })
        .expect(400);
    });

    it('400s on a content length over the 5MB cap', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'image/jpeg', contentLength: 5 * 1024 * 1024 + 1 })
        .expect(400);
    });

    it('rejects a client-supplied key outright — the server always generates it, never accepts one', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'image/png', contentLength: 2048, key: 'listings/someone-else/x.png' })
        .expect(400);
    });

    it('the key is always generated server-side, scoped to the caller, regardless of what else is in the body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'image/png', contentLength: 2048 })
        .expect(200);

      expect(res.body.key).toMatch(new RegExp(`^listings/${userId}/[0-9a-f-]+\\.png$`));
    });

    it('429s once the per-user rate limit is exceeded', async () => {
      const limit = 20;
      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .post('/api/uploads/presign')
          .set('Cookie', rateLimitCookie)
          .send({ contentType: 'image/jpeg', contentLength: 1024 })
          .expect(200);
      }

      await request(app.getHttpServer())
        .post('/api/uploads/presign')
        .set('Cookie', rateLimitCookie)
        .send({ contentType: 'image/jpeg', contentLength: 1024 })
        .expect(429);
    });
  });
});
