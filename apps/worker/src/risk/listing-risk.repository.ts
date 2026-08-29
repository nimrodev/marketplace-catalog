import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskLevel } from '@marketplace/shared';
import { ListingRisk } from '../entities/listing-risk.entity';

export interface UpsertListingRiskInput {
  listingId: string;
  level: RiskLevel;
  reasons: string[];
  flags: string[];
  model: string;
  evaluatedAt: Date;
}

@Injectable()
export class ListingRiskRepository {
  constructor(@InjectRepository(ListingRisk) private readonly repo: Repository<ListingRisk>) {}

  // ON CONFLICT (listing_id) DO UPDATE — reprocessing the same listing
  // overwrites cleanly instead of erroring on the PK or duplicating rows.
  async upsert(input: UpsertListingRiskInput): Promise<void> {
    await this.repo.upsert(input, { conflictPaths: ['listingId'] });
  }
}
