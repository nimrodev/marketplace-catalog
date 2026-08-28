import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UserThrottlerGuard } from './user-throttler.guard';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UserThrottlerGuard],
})
export class UploadsModule {}
