import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from './listing.entity';
import { ListingPhoto } from './listing-photo.entity';
import { ListingRisk } from './listing-risk.entity';
import { ListingsController } from './listings.controller';
import { ListingsRepository } from './listings.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, ListingPhoto, ListingRisk])],
  controllers: [ListingsController],
  providers: [ListingsRepository],
})
export class ListingsModule {}
