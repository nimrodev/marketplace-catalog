import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ListingCategory, ListingStatus } from '@marketplace/shared';

// Slim mirror of apps/api's Listing entity — the worker only needs enough
// columns to run pre-screen checks and can't import the API's own entity
// (each app is deployed independently, see apps/worker's README note in PLAN.md).
@Entity('listings')
export class Listing {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column('text')
  description!: string;

  @Column('numeric', { precision: 12, scale: 2 })
  price!: string;

  @Column({ type: 'enum', enum: ListingCategory })
  category!: ListingCategory;

  @Column({ type: 'enum', enum: ListingStatus })
  status!: ListingStatus;
}
