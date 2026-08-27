import { HealthIndicatorService } from '@nestjs/terminus';
import { CacheHealthIndicator } from './cache.health-indicator';

describe('CacheHealthIndicator', () => {
  let indicator: CacheHealthIndicator;
  let cache: { set: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    cache = { set: jest.fn(), get: jest.fn() };
    indicator = new CacheHealthIndicator(
      cache as any,
      new HealthIndicatorService(),
    );
  });

  it('reports up when the probe round-trips correctly', async () => {
    cache.set.mockResolvedValue(undefined);
    cache.get.mockResolvedValue('ok');

    const result = await indicator.pingCheck('cache');

    expect(result.cache.status).toBe('up');
  });

  it('reports down when the read-back value does not match', async () => {
    cache.set.mockResolvedValue(undefined);
    cache.get.mockResolvedValue('unexpected-value');

    const result = await indicator.pingCheck('cache');

    expect(result.cache.status).toBe('down');
  });

  it('reports down when the cache backend throws', async () => {
    cache.set.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await indicator.pingCheck('cache');

    expect(result.cache.status).toBe('down');
    expect(result.cache.message).toBe('ECONNREFUSED');
  });
});
