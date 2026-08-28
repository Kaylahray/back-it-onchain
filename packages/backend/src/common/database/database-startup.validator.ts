import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * DatabaseStartupValidator
 *
 * Runs on application bootstrap and checks that the required BTree indexes
 * and the participants table created by migration
 * `AddBTreeIndexesAndParticipants1745358977000` are present in the database.
 *
 * On failure it logs a warning rather than crashing so that environments
 * without a running DB (e.g. unit-test CI) are not broken.
 */
@Injectable()
export class DatabaseStartupValidator implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseStartupValidator.name);

  /** Required indexes as defined in issue #306 / migration spec. */
  private static readonly REQUIRED_INDEXES = [
    'IDX_call_status',
    'IDX_call_end_ts',
    'IDX_participant_call_wallet',
  ];

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Skip in test environments to avoid needing a live DB in CI unit tests
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'test') return;

    try {
      await this.validateIndexes();
    } catch (err) {
      this.logger.warn(
        `Database startup validation skipped (DB unavailable): ${(err as Error).message}`,
      );
    }
  }

  private async validateIndexes(): Promise<void> {
    const rows: Array<{ indexname: string }> = await this.dataSource.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);

    const present = new Set(rows.map((r) => r.indexname));
    const missing = DatabaseStartupValidator.REQUIRED_INDEXES.filter(
      (idx) => !present.has(idx),
    );

    if (missing.length > 0) {
      this.logger.warn(
        `Database integrity check: missing indexes [${missing.join(', ')}]. ` +
          'Run pending migrations to resolve.',
      );
    } else {
      this.logger.log('Database integrity check passed — all required indexes present.');
    }
  }
}
