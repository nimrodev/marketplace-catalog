import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddListingDomain1787860371338 implements MigrationInterface {
  name = 'AddListingDomain1787860371338';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('CONTRIBUTOR', 'MODERATOR', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."listings_condition_enum" AS ENUM('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."listings_category_enum" AS ENUM('ELECTRONICS', 'FURNITURE', 'CLOTHING', 'VEHICLES', 'HOME_GARDEN', 'SPORTS_OUTDOORS', 'TOYS_GAMES', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."listings_options_enum" AS ENUM('DELIVERY_AVAILABLE', 'LOCAL_PICKUP', 'OPEN_TO_TRADES', 'ORIGINAL_PACKAGING', 'WARRANTY_INCLUDED', 'BUNDLE_DEAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."listings_status_enum" AS ENUM('PENDING', 'PUBLISHED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "listings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "title" character varying NOT NULL, "description" text NOT NULL, "price" numeric(12,2) NOT NULL, "condition" "public"."listings_condition_enum" NOT NULL, "category" "public"."listings_category_enum" NOT NULL, "is_negotiable" boolean NOT NULL DEFAULT false, "min_price" numeric(12,2), "options" "public"."listings_options_enum" array NOT NULL DEFAULT '{}', "status" "public"."listings_status_enum" NOT NULL DEFAULT 'PENDING', "rejection_reason" text, "contributor_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_00cd85ea191a7f2003c06bf97c" CHECK (char_length("title") BETWEEN 3 AND 120), CONSTRAINT "CHK_b972e35dfe8b2b2abc2c67ed92" CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL), CONSTRAINT "CHK_cc80a1db2f8525a557073e5818" CHECK ("min_price" IS NULL OR ("is_negotiable" AND "min_price" > 0 AND "min_price" <= "price")), CONSTRAINT "CHK_2bc08137069e109a16fcb942e8" CHECK ("price" > 0), CONSTRAINT "PK_520ecac6c99ec90bcf5a603cdcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."listing_risk_level_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `CREATE TABLE "listing_risk" ("listing_id" uuid NOT NULL, "level" "public"."listing_risk_level_enum" NOT NULL, "reasons" text array NOT NULL DEFAULT '{}', "flags" text array NOT NULL DEFAULT '{}', "model" character varying NOT NULL, "evaluated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_cf0cc86066c46718257d7695c2a" PRIMARY KEY ("listing_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "listing_photos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "listing_id" uuid NOT NULL, "s3_key" character varying NOT NULL, "sort_order" integer NOT NULL, CONSTRAINT "PK_73c5fd7f964a698b78f0920917c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "FK_271cc0a1cc7bd7f793808721da4" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_risk" ADD CONSTRAINT "FK_cf0cc86066c46718257d7695c2a" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_photos" ADD CONSTRAINT "FK_43b5cd835afddfa23aa47339782" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listing_photos" DROP CONSTRAINT "FK_43b5cd835afddfa23aa47339782"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_risk" DROP CONSTRAINT "FK_cf0cc86066c46718257d7695c2a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "FK_271cc0a1cc7bd7f793808721da4"`,
    );
    await queryRunner.query(`DROP TABLE "listing_photos"`);
    await queryRunner.query(`DROP TABLE "listing_risk"`);
    await queryRunner.query(`DROP TYPE "public"."listing_risk_level_enum"`);
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(`DROP TYPE "public"."listings_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."listings_options_enum"`);
    await queryRunner.query(`DROP TYPE "public"."listings_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."listings_condition_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
