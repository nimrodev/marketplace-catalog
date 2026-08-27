import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Listing } from './listing.entity';

// Primary photo is sort_order = 0 — enforced by query/service logic
// (later issues), not a DB constraint, since "exactly one photo at
// sort_order 0" isn't expressible as a single-row CHECK constraint.
@Entity('listing_photos')
export class ListingPhoto {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  listingId!: string;

  @ManyToOne(() => Listing)
  @JoinColumn({ name: 'listing_id' })
  listing!: Listing;

  @Column()
  s3Key!: string;

  @Column('int')
  sortOrder!: number;
}
