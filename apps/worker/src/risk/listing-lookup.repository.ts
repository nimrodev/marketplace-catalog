import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from '../entities/listing.entity';
import { ListingPhoto } from '../entities/listing-photo.entity';

export interface ListingForPrescreen {
  listing: Listing;
  photos: ListingPhoto[];
}

@Injectable()
export class ListingLookupRepository {
  constructor(
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(ListingPhoto) private readonly photos: Repository<ListingPhoto>,
  ) {}

  // Returns null on the rare race where the listing was hard-deleted
  // between enqueue and consume — the caller treats that as unrecoverable.
  async findForPrescreen(listingId: string): Promise<ListingForPrescreen | null> {
    const listing = await this.listings.findOne({ where: { id: listingId } });
    if (!listing) return null;
    const photos = await this.photos.find({ where: { listingId }, order: { sortOrder: 'ASC' } });
    return { listing, photos };
  }
}
