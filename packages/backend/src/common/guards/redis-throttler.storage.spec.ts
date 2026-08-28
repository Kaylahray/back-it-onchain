import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    // Without REDIS_URL the storage falls back to an in-memory map.
    storage = new RedisThrottlerStorage(undefined);
  });

  it('increments the hit counter for a key', async () => {
    const first = await storage.increment('1.2.3.4', 60000, 60, 0, 'default');
    expect(first.totalHits).toBe(1);
    expect(first.timeToExpire).toBe(60000);
    expect(first.isBlocked).toBe(false);

    const second = await storage.increment('1.2.3.4', 60000, 60, 0, 'default');
    expect(second.totalHits).toBe(2);
  });

  it('blocks once the limit is exceeded', async () => {
    // limit 2 → third increment becomes blocked
    for (let i = 0; i < 2; i++) {
      await storage.increment('wallet-1', 60000, 2, 30000, 'wallet');
    }
    const blocked = await storage.increment('wallet-1', 60000, 2, 30000, 'wallet');
    expect(blocked.totalHits).toBe(3);
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBe(30000);
  });

  it('keys are namespaced by throttler name', async () => {
    await storage.increment('1.2.3.4', 60000, 1, 0, 'default');
    const other = await storage.increment('1.2.3.4', 60000, 1, 0, 'wallet');
    expect(other.totalHits).toBe(1);
  });

  it('constructs with a redis url without throwing', () => {
    const redisStorage = new RedisThrottlerStorage('redis://localhost:6379');
    expect(redisStorage).toBeDefined();
  });
});
