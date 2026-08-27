import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgcryptoExtension1787859341196 implements MigrationInterface {
  name = 'EnablePgcryptoExtension1787859341196';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS pgcrypto');
  }
}
