import { MigrationInterface, QueryRunner } from 'typeorm';

// Performance indexes for the catalog query and its filters (MAR-21,
// not yet built) — each maps to a specific access pattern documented in
// PLAN.md §3. Hand-written rather than via @Index() decorators: TypeORM's
// decorator can't express per-column DESC ordering or a partial WHERE
// clause, both of which matter here (see each index below).
export class AddCatalogIndexes1787862633781 implements MigrationInterface {
  name = 'AddCatalogIndexes1787862633781';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The public catalog's keyset pagination query: WHERE status =
    // 'PUBLISHED' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC.
    // Partial (excludes soft-deleted rows, which the query always excludes
    // anyway) and DESC-ordered to match the ORDER BY exactly, so Postgres
    // can walk the index directly instead of sorting after a scan.
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_catalog_keyset"
         ON "listings" ("status", "created_at" DESC, "id" DESC)
         WHERE "deleted_at" IS NULL`,
    );

    // Category-filtered browse: same query with an added category filter.
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_status_category_keyset"
         ON "listings" ("status", "category", "created_at" DESC, "id" DESC)`,
    );

    // "My listings" — a contributor's own listings across all statuses,
    // newest first.
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_contributor_created"
         ON "listings" ("contributor_id", "created_at" DESC)`,
    );

    // Multi-select option filtering (options @> ARRAY[...] / && ARRAY[...]).
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_options_gin" ON "listings" USING GIN ("options")`,
    );

    // Price-range filtering (price BETWEEN :min AND :max).
    await queryRunner.query(`CREATE INDEX "IDX_listings_price" ON "listings" ("price")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_listings_price"');
    await queryRunner.query('DROP INDEX "IDX_listings_options_gin"');
    await queryRunner.query('DROP INDEX "IDX_listings_contributor_created"');
    await queryRunner.query('DROP INDEX "IDX_listings_status_category_keyset"');
    await queryRunner.query('DROP INDEX "IDX_listings_catalog_keyset"');
  }
}
