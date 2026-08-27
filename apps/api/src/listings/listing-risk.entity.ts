import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { RiskLevel } from '@marketplace/shared';
import { Listing } from './listing.entity';

@Entity('listing_risk')
export class ListingRisk {
  @PrimaryColumn('uuid')
  listingId!: string;

  @OneToOne(() => Listing)
  @JoinColumn({ name: 'listing_id' })
  listing!: Listing;

  @Column({ type: 'enum', enum: RiskLevel })
  level!: RiskLevel;

  @Column('text', { array: true, default: [] })
  reasons!: string[];

  @Column('text', { array: true, default: [] })
  flags!: string[];

  @Column()
  model!: string;

  @Column('timestamptz')
  evaluatedAt!: Date;
}
