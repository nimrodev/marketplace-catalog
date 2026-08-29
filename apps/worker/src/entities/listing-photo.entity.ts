import { Column, Entity, PrimaryColumn } from 'typeorm';

// Slim mirror of apps/api's ListingPhoto entity — see listing.entity.ts.
@Entity('listing_photos')
export class ListingPhoto {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column()
  s3Key!: string;

  @Column('int')
  sortOrder!: number;
}
