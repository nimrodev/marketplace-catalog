import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { SqsHealthIndicator } from './sqs-health.indicator';

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, SqsHealthIndicator],
})
export class HealthModule {}
