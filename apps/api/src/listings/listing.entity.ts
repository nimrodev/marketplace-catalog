import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { User } from '../users/user.entity';

// Layer 3 validation (PLAN.md §4) — deliberately duplicates rules also
// enforced in the DTO and service layers. That's the point: a bug in
// application code must not be able to corrupt data. Column names below
// are the actual DB (snake_case, via SnakeNamingStrategy) names — these
// are raw SQL fragments, not TS property references.
@Entity('listings')
@Check(`"price" > 0`)
@Check(`"min_price" IS NULL OR ("is_negotiable" AND "min_price" > 0 AND "min_price" <= "price")`)
@Check(`"status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL`)
@Check(`char_length("title") BETWEEN 3 AND 120`)
export class Listing {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column()
  title!: string;

  @Column('text')
  description!: string;

  @Column('numeric', { precision: 12, scale: 2 })
  price!: string;

  @Column({ type: 'enum', enum: ListingCondition })
  condition!: ListingCondition;

  @Column({ type: 'enum', enum: ListingCategory })
  category!: ListingCategory;

  @Column({ default: false })
  isNegotiable!: boolean;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  minPrice!: string | null;

  @Column({ type: 'enum', enum: ListingOption, array: true, default: [] })
  options!: ListingOption[];

  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.PENDING })
  status!: ListingStatus;

  @Column('text', { nullable: true })
  rejectionReason!: string | null;

  @Column('uuid')
  contributorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'contributor_id' })
  contributor!: User;

  @Column('timestamptz', { nullable: true })
  expiresAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column('timestamptz', { nullable: true })
  publishedAt!: Date | null;
}
