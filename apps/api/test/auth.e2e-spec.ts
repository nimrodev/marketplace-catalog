import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { AUTH_COOKIE_NAME } from '../src/auth/session.constants';

const PASSWORD = 'CorrectPass1!';

// No jsonwebtoken dependency in this app, so decode the payload manually
// (base64url, no signature check needed — this only asserts on claim shape).
function decodeJwtPayload(token: string): unknown {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// Extracts the `auth_token=<value>` piece of a Set-Cookie header so it can
// be replayed on the next request via .set('Cookie', ...).
function extractCookie(res: request.Response): string {
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) {
    throw new Error('Expected a Set-Cookie header');
  }
  return header.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let activeUserId: string;
  let inactiveUserId: string;
  const activeEmail = 'auth-e2e-active@example.com';
  const inactiveEmail = 'auth-e2e-inactive@example.com';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const [active] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'CONTRIBUTOR', true) RETURNING id`,
      [activeEmail, passwordHash],
    );
    activeUserId = active.id;

    const [inactive] = await dataSource.query(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'CONTRIBUTOR', false) RETURNING id`,
      [inactiveEmail, passwordHash],
    );
    inactiveUserId = inactive.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [[activeUserId, inactiveUserId]]);
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('succeeds with correct credentials, sets an httpOnly cookie, and never returns passwordHash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: activeEmail, password: PASSWORD })
        .expect(200);

      expect(res.body).toEqual({ id: activeUserId, email: activeEmail, role: 'CONTRIBUTOR' });
      expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'role']);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const setCookie = res.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(cookieHeader).toMatch(/HttpOnly/i);
      expect(cookieHeader).toMatch(/SameSite=Lax/i);

      const cookie = extractCookie(res);
      const payload = decodeJwtPayload(cookie.split('=')[1]);
      expect(payload).toMatchObject({ sub: activeUserId, role: 'CONTRIBUTOR' });
    });

    it('fails with a uniform message for a wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: activeEmail, password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });

    it('fails with the identical status and message for an unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody-at-all@example.com', password: 'irrelevant' })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });

    it('fails for a deactivated account, even with the correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: inactiveEmail, password: PASSWORD })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });

    it('400s on a malformed request body rather than 500ing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user for a valid cookie', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: activeEmail, password: PASSWORD })
        .expect(200);
      const cookie = extractCookie(loginRes);

      const res = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);

      expect(res.body).toEqual({ id: activeUserId, email: activeEmail, role: 'CONTRIBUTOR' });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('401s with no cookie', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('401s with a tampered cookie, not a 500', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-real-jwt`)
        .expect(401);
    });

    it('401s for a user deactivated after login, using the still-valid cookie', async () => {
      const inactivePassword = await bcrypt.hash(PASSWORD, 10);
      const [toggled] = await dataSource.query(
        `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'CONTRIBUTOR', true) RETURNING id`,
        ['auth-e2e-toggled@example.com', inactivePassword],
      );

      try {
        const loginRes = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'auth-e2e-toggled@example.com', password: PASSWORD })
          .expect(200);
        const cookie = extractCookie(loginRes);

        await dataSource.query('UPDATE users SET is_active = false WHERE id = $1', [toggled.id]);

        await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
      } finally {
        await dataSource.query('DELETE FROM users WHERE id = $1', [toggled.id]);
      }
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the auth cookie', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/logout').expect(200);

      const setCookie = res.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).toContain(`${AUTH_COOKIE_NAME}=`);
      // clearCookie expires the cookie immediately.
      expect(cookieHeader).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });

    it('a cookie cleared by logout no longer authenticates /auth/me', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: activeEmail, password: PASSWORD })
        .expect(200);
      const cookie = extractCookie(loginRes);
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);

      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(200);
      const clearedCookie = extractCookie(logoutRes);

      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', clearedCookie).expect(401);
    });
  });
});
