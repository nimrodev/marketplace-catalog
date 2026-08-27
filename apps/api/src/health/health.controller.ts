import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { SqsHealthIndicator } from './sqs-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseHealthIndicator,
    private readonly sqs: SqsHealthIndicator,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    const [dbUp, sqsUp] = await Promise.all([this.db.isHealthy(), this.sqs.isHealthy()]);
    const status = {
      database: dbUp ? 'up' : 'down',
      sqs: sqsUp ? 'up' : 'down',
    };
    if (!dbUp || !sqsUp) {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
