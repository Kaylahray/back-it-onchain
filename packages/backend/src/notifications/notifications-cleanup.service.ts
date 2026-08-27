import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification } from './notification.entity';

/** Chunk size for batched deletes to avoid long-running transactions. */
const CHUNK_SIZE = 100;

@Injectable()
export class NotificationsCleanupService {
  private readonly logger = new Logger(NotificationsCleanupService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Purges read notifications older than 30 days (configurable via
   * NOTIFICATION_RETENTION_DAYS env var). Runs daily at 03:00 with jitter.
   */
  @Cron('0 3 * * *')
  async handleNotificationCleanup(): Promise<void> {
    const dryRun = this.configService.get<boolean>('CLEANUP_DRY_RUN', false);
    const retentionDays = this.configService.get<number>(
      'NOTIFICATION_RETENTION_DAYS',
      30,
    );

    // Small jitter to spread load across instances
    const jitterMs = Math.floor(Math.random() * 30_000);
    await new Promise((r) => setTimeout(r, jitterMs));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stale = await this.notificationsRepo.find({
      where: { isRead: true, createdAt: LessThan(cutoff) },
      select: ['id'],
    });

    if (stale.length === 0) {
      this.logger.log('NotificationsCleanup: no stale read notifications found');
      return;
    }

    this.logger.log(
      `NotificationsCleanup: found ${stale.length} read notifications older than ${retentionDays}d${dryRun ? ' [DRY RUN]' : ''}`,
    );

    if (dryRun) return;

    const ids = stale.map((n) => n.id);
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      await this.notificationsRepo.delete(chunk);
      this.logger.debug(
        `NotificationsCleanup: deleted chunk ${i / CHUNK_SIZE + 1} (${chunk.length} rows)`,
      );
    }

    this.logger.log(`NotificationsCleanup: deleted ${ids.length} stale read notifications`);
  }
}
