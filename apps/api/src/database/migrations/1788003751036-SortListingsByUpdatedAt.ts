import { MigrationInterface, QueryRunner } from 'typeorm';

// Catalog, My Listings, and the moderation queue all sort by "most
// recently touched" now, not "most recently created" — an edited or
// re-submitted listing should surface, not stay buried at its original
// creation position. Replaces the MAR-9 created_at indexes with
// updated_at equivalents; nothing else still needs the old ones.
export class SortListingsByUpdatedAt1788003751036 implements MigrationInterface {
  name = 'SortListingsByUpdatedAt1788003751036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_listings_catalog_keyset"');
    await queryRunner.query('DROP INDEX "IDX_listings_status_category_keyset"');
    await queryRunner.query('DROP INDEX "IDX_listings_contributor_created"');

    await queryRunner.query(
      `CREATE INDEX "IDX_listings_catalog_keyset"
         ON "listings" ("status", "updated_at" DESC, "id" DESC)
         WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_status_category_keyset"
         ON "listings" ("status", "category", "updated_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_contributor_updated"
         ON "listings" ("contributor_id", "updated_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_listings_contributor_updated"');
    await queryRunner.query('DROP INDEX "IDX_listings_status_category_keyset"');
    await queryRunner.query('DROP INDEX "IDX_listings_catalog_keyset"');

    await queryRunner.query(
      `CREATE INDEX "IDX_listings_status_category_keyset"
         ON "listings" ("status", "category", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_catalog_keyset"
         ON "listings" ("status", "created_at" DESC, "id" DESC)
         WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_contributor_created"
         ON "listings" ("contributor_id", "created_at" DESC)`,
    );
  }
}
