import { BadRequestException, Injectable } from '@nestjs/common';
import { ListingDetail, RiskLevel, runDeterministicChecks } from '@marketplace/shared';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { ListingsRepository } from './listings.repository';

@Injectable()
export class ListingsService {
  constructor(
    private readonly listings: ListingsRepository,
    private readonly photoOwnership: PhotoOwnershipValidator,
  ) {}

  async create(contributorId: string, dto: CreateListingRequestDto): Promise<ListingDetail> {
    await this.photoOwnership.validate(contributorId, dto.photoKeys);

    const screen = runDeterministicChecks({
      title: dto.title,
      description: dto.description,
      price: dto.price,
      category: dto.category,
    });
    if (screen.level === RiskLevel.HIGH) {
      throw new BadRequestException(`This listing cannot be submitted: ${screen.reasons.join(', ')}.`);
    }

    // Pre-screen queue publish is deliberately not wired up — no queue
    // consumer exists yet.
    return this.listings.create(contributorId, dto);
  }
}
