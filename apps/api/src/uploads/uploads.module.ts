import { Module } from '@nestjs/common';
import { PhotoOwnershipValidator } from './photo-ownership.validator';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UserThrottlerGuard } from './user-throttler.guard';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UserThrottlerGuard, PhotoOwnershipValidator],
  // PhotoOwnershipValidator is consumed by ListingsModule once the create
  // endpoint exists (MAR-18) and by the AI draft endpoint (MAR-31).
  exports: [PhotoOwnershipValidator],
})
export class UploadsModule {}
