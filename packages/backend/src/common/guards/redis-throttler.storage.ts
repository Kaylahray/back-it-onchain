import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

type KeyvClient = {
  get(key: string): Promise<ThrottlerStorageRecord | undefined>;
  set(
    key: string,
    value: ThrottlerStorageRecord,
    ttl?: number,
  ): Promise<unknown>;
};

/**
 * Redis-backed storage for @nestjs/throttler.
 *
 * Falls back to an in-memory map when REDIS_URL is not configured so the
 * application still starts in local/dev environments.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private keyv: KeyvClient;
  private readonly memory = new Map<string, ThrottlerStorageRecord>();

  constructor(redisUrl?: string) {
    // KeyvRedis is loaded lazily via dynamic import to avoid a hard
    // dependency when Redis is not configured.
    if (redisUrl) {
      this.keyv = {
        get: async (key) => {
          const mod = await import('@keyv/redis');
          const KeyvRedis = mod.default as new (url: string) => unknown;
          const client = new KeyvRedis(redisUrl) as {
            get: (k: string) => Promise<unknown>;
            set: (k: string, v: unknown, ttl?: number) => Promise<unknown>;
          };
          const value = await client.get(key);
          return value as ThrottlerStorageRecord | undefined;
        },
        set: async (key, value, ttl) => {
          const mod = await import('@keyv/redis');
          const KeyvRedis = mod.default as new (url: string) => unknown;
          const client = new KeyvRedis(redisUrl) as {
            get: (k: string) => Promise<unknown>;
            set: (k: string, v: unknown, ttl?: number) => Promise<unknown>;
          };
          return client.set(key, value, ttl);
        },
      };
    } else {
      this.keyv = {
        get: async (key) => this.memory.get(key),
        set: async (key, value, ttl) => {
          this.memory.set(key, value);
          if (ttl) {
            setTimeout(() => this.memory.delete(key), ttl);
          }
          return true;
        },
      };
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const fullKey = `${throttlerName}:${key}`;
    const record = (await this.keyv.get(fullKey)) ?? {
      totalHits: 0,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };

    record.totalHits += 1;
    record.timeToExpire = ttl;

    if (limit > 0 && record.totalHits > limit) {
      record.isBlocked = true;
      record.timeToBlockExpire = blockDuration;
    }

    let windowTtl: number | undefined = ttl;
    if (record.isBlocked && blockDuration > 0) {
      windowTtl = blockDuration;
    }
    if (windowTtl && windowTtl > 0) {
      await this.keyv.set(fullKey, record, windowTtl);
    }

    return record;
  }
}