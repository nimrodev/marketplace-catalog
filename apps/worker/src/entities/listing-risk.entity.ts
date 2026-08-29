import { Column, Entity, PrimaryColumn } from 'typeorm';
import { RiskLevel } from '@marketplace/shared';

// Slim mirror of apps/api's ListingRisk entity, minus the relation to
// Listing — the worker only ever writes this table, never joins through it.
@Entity('listing_risk')
export class ListingRisk {
  @PrimaryColumn('uuid')
  listingId!: string;

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
