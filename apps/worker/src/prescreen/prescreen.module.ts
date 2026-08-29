import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../entities/listing.entity';
import { ListingPhoto } from '../entities/listing-photo.entity';
import { ListingRisk } from '../entities/listing-risk.entity';
import { AnthropicClientService } from '../ai/anthropic-client.service';
import { PhotoFetcherService } from '../ai/photo-fetcher.service';
import { PrescreenAiService } from '../ai/prescreen-ai.service';
import { ListingLookupRepository } from '../risk/listing-lookup.repository';
import { ListingRiskRepository } from '../risk/listing-risk.repository';
import { PrescreenMessageProcessor } from './prescreen-message-processor.service';
import { PrescreenConsumerService } from './prescreen-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, ListingPhoto, ListingRisk])],
  providers: [
    AnthropicClientService,
    PhotoFetcherService,
    PrescreenAiService,
    ListingLookupRepository,
    ListingRiskRepository,
    PrescreenMessageProcessor,
    PrescreenConsumerService,
  ],
  exports: [PrescreenConsumerService],
})
export class PrescreenModule {}
