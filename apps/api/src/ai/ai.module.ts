import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AnthropicClientService } from './anthropic-client.service';
import { DraftListingController } from './draft-listing.controller';
import { DraftListingService } from './draft-listing.service';

@Module({
  imports: [UploadsModule],
  controllers: [DraftListingController],
  providers: [AnthropicClientService, DraftListingService],
  exports: [AnthropicClientService],
})
export class AiModule {}
