import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds full-text search support for calls and users:
 *   - stored `tsvector` columns populated from title/description / displayName
 *   - GIN indexes on those columns
 *   - enables the `pg_trgm` extension for trigram similarity ranking (`%`)
 */
export class AddSearchTsvector1777000000000 implements MigrationInterface {
  name = 'AddSearchTsvector1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      ALTER TABLE "call"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
        ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_call_search_vector"
        ON "call" USING GIN ("search_vector")
    `);

    await queryRunner.query(`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce("displayName", '') || ' ' || coalesce("handle", ''))
        ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_search_vector"
        ON "user" USING GIN ("search_vector")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_call_search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "call" DROP COLUMN IF EXISTS "search_vector"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "search_vector"`,
    );
  }
}
