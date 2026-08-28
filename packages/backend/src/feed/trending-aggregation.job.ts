import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeedService } from './feed.service';

/**
 * TrendingAggregationJob
 *
 * Materialises the trending feed into cache every 5 minutes.
 *
 * A distributed lock is used so that, when multiple backend instances (or
 * overlapping runs) exist, only a single instance performs the recompute —
 * this is the cache/Redis equivalent of Postgres `SKIP LOCKED`: whichever
 * instance wins the lock executes the refresh; every other instance skips it.
 * The lock holds a short TTL so a crashed worker cannot block future runs.
 */
@Injectable()
export class TrendingAggregationJob {
  private readonly logger = new Logger(TrendingAggregationJob.name);

  private readonly LOCK_KEY = 'feed:trending:lock';
  private readonly LOCK_TTL_MS = 120_000; // 2 min — auto-releases on crash

  constructor(
    private readonly feedService: FeedService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    this.logger.log('Running trending feed aggregation cron');

    if (!(await this.acquireLock())) {
      this.logger.log('Trending lock held by another instance — skipping run');
      return;
    }

    try {
      const top = await this.feedService.refreshTrendingCache();
      this.logger.log(
        `Trending feed cache refreshed (${top.length} calls computed)`,
      );
    } catch (error) {
      this.logger.error(`Failed to refresh trending feed cache: ${error}`);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Attempt to acquire the distributed lock. Returns false when another
   * instance already holds it (best-effort, Redis-backed `SET NX` via cache
   * manager).
   */
  private async acquireLock(): Promise<boolean> {
    const held = await this.cacheManager.get(this.LOCK_KEY);
    if (held) return false;
    await this.cacheManager.set(this.LOCK_KEY, true, this.LOCK_TTL_MS);
    return true;
  }

  private async releaseLock(): Promise<void> {
    await this.cacheManager.del(this.LOCK_KEY);
  }
}
