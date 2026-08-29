import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../listings/listing.entity';
import { ListingsModule } from '../listings/listings.module';
import { ModerationController } from './moderation.controller';
import { ModerationRepository } from './moderation.repository';
import { ModerationService } from './moderation.service';

@Module({
  imports: [ListingsModule, TypeOrmModule.forFeature([Listing])],
  controllers: [ModerationController],
  providers: [ModerationService, ModerationRepository],
})
export class ModerationModule {}
