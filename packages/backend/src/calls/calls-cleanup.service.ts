import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { Call } from './call.entity';
import { ConfigService } from '@nestjs/config';

/** Chunk size for batched deletes to avoid long-running transactions. */
const CHUNK_SIZE = 100;

@Injectable()
export class CallsCleanupService {
  private readonly logger = new Logger(CallsCleanupService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Deletes OPEN draft calls that have no onchain ID and are older than 7 days.
   * Runs daily at midnight with a small random jitter to spread DB load.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDraftCallsCleanup(): Promise<void> {
    const dryRun = this.configService.get<boolean>('CLEANUP_DRY_RUN', false);

    // Small jitter: spread execution up to 30 s to avoid thundering-herd on multi-instance deploys
    const jitterMs = Math.floor(Math.random() * 30_000);
    await new Promise((r) => setTimeout(r, jitterMs));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const stale = await this.callsRepo.find({
      where: {
        status: 'OPEN',
        callOnchainId: IsNull(),
        createdAt: LessThan(cutoff),
      },
      select: ['id'],
    });

    if (stale.length === 0) {
      this.logger.log('CallsCleanup: no stale OPEN drafts found');
      return;
    }

    this.logger.log(
      `CallsCleanup: found ${stale.length} stale OPEN drafts older than 7d${dryRun ? ' [DRY RUN]' : ''}`,
    );

    if (dryRun) return;

    // Delete in chunks
    const ids = stale.map((c) => c.id);
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      await this.callsRepo.delete(chunk);
      this.logger.debug(`CallsCleanup: deleted chunk ${i / CHUNK_SIZE + 1} (${chunk.length} rows)`);
    }

    this.logger.log(`CallsCleanup: deleted ${ids.length} stale OPEN draft calls`);
  }
}
