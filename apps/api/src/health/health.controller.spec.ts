import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { SqsHealthIndicator } from './sqs-health.indicator';

describe('HealthController', () => {
  const build = async (dbUp: boolean, sqsUp: boolean) => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DatabaseHealthIndicator, useValue: { isHealthy: jest.fn().mockResolvedValue(dbUp) } },
        { provide: SqsHealthIndicator, useValue: { isHealthy: jest.fn().mockResolvedValue(sqsUp) } },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  };

  it('GET /health always reports ok without touching dependencies', async () => {
    const controller = await build(false, false);
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns ok when DB and SQS are both reachable', async () => {
    const controller = await build(true, true);
    await expect(controller.readiness()).resolves.toEqual({ database: 'up', sqs: 'up' });
  });

  it('GET /health/ready throws 503 when the DB is unreachable', async () => {
    const controller = await build(false, true);
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('GET /health/ready throws 503 when SQS is unreachable', async () => {
    const controller = await build(true, false);
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
