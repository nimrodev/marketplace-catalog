import { Module } from '@nestjs/common';
import { PhotoOwnershipValidator } from './photo-ownership.validator';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UserThrottlerGuard } from './user-throttler.guard';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UserThrottlerGuard, PhotoOwnershipValidator],
  // PhotoOwnershipValidator and UserThrottlerGuard are reused by the AI
  // draft endpoint, which re-runs the same ownership check and needs its
  // own per-user rate limit.
  exports: [PhotoOwnershipValidator, UserThrottlerGuard],
})
export class UploadsModule {}
