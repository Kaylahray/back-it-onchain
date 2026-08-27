import { Inject, Injectable } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

const PROBE_KEY = 'health:cache:probe';
const PROBE_VALUE = 'ok';
const PROBE_TTL_MS = 5_000;

/**
 * Confirms the cache backend (Redis via @keyv/redis, or the in-memory
 * fallback) is reachable and read/write-capable by round-tripping a
 * short-lived probe key.
 */
@Injectable()
export class CacheHealthIndicator {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck<Key extends string>(
    key: Key,
  ): Promise<HealthIndicatorResult<Key>> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.cache.set(PROBE_KEY, PROBE_VALUE, PROBE_TTL_MS);
      const readBack = await this.cache.get(PROBE_KEY);

      if (readBack !== PROBE_VALUE) {
        return indicator.down({ message: 'cache read did not match write' });
      }
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }
}
