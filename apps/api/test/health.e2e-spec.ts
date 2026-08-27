import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with no downstream dependencies touched', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /health/ready is unprefixed and shape-checked live against the configured DB/SQS', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toEqual({
      database: expect.stringMatching(/^(up|down)$/),
      sqs: expect.stringMatching(/^(up|down)$/),
    });
  });
});
