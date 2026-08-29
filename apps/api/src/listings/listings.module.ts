import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '../uploads/uploads.module';
import { Listing } from './listing.entity';
import { ListingPhoto } from './listing-photo.entity';
import { ListingRisk } from './listing-risk.entity';
import { ListingsController } from './listings.controller';
import { ListingsRepository } from './listings.repository';
import { ListingsService } from './listings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, ListingPhoto, ListingRisk]), UploadsModule],
  controllers: [ListingsController],
  providers: [ListingsRepository, ListingsService],
  exports: [ListingsRepository],
})
export class ListingsModule {}
