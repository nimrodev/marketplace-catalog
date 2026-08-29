import { Module } from '@nestjs/common';
import { PreScreenQueueService } from './pre-screen-queue.service';

@Module({
  providers: [PreScreenQueueService],
  exports: [PreScreenQueueService],
})
export class PreScreenModule {}
