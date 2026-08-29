import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [ListingsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
