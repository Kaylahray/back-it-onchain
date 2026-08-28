import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { TokensService } from './tokens.service';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('TokensService', () => {
  let service: TokensService;
  let cache: { get: jest.Mock; set: jest.Mock };
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    cache = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TokensService, { provide: CACHE_MANAGER, useValue: cache }],
    }).compile();

    service = module.get<TokensService>(TokensService);
    fetchSpy = jest.spyOn(global, 'fetch' as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns a cached result without calling any external API', async () => {
    const cached = [{ address: '0xabc', name: 'Cached', symbol: 'CCH' }];
    cache.get.mockResolvedValue(cached);

    const result = await service.search('cached');

    expect(result).toBe(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizes a DexScreener pair and computes a safety score', async () => {
    cache.get.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValue(
      jsonResponse({
        pairs: [
          {
            chainId: 'base',
            dexId: 'uniswap',
            url: 'https://dexscreener.com/base/0xpair',
            baseToken: { address: '0xtoken', name: 'Test Token', symbol: 'TEST' },
            priceUsd: '1.5',
            liquidity: { usd: 100_000 },
            volume: { h24: 5000 },
            txns: { h24: { buys: 50, sells: 50 } },
            pairCreatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
          },
        ],
      }),
    );

    const [result] = await service.search('test');

    expect(result.address).toBe('0xtoken');
    expect(result.symbol).toBe('TEST');
    expect(result.priceUsd).toBe(1.5);
    expect(result.liquidityUsd).toBe(100_000);
    // Full liquidity (40) + full age (30) + balanced txns (30) ≈ 100
    expect(result.safetyScore).toBe(100);
    expect(cache.set).toHaveBeenCalledWith(
      'token-search:test',
      expect.any(Array),
      5 * 60 * 1000,
    );
  });

  it('scores a brand-new, illiquid, one-sided pair as unsafe', async () => {
    cache.get.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValue(
      jsonResponse({
        pairs: [
          {
            chainId: 'base',
            dexId: 'uniswap',
            url: 'https://dexscreener.com/base/0xrug',
            baseToken: { address: '0xrug', name: 'Rug', symbol: 'RUG' },
            liquidity: { usd: 0 },
            txns: { h24: { buys: 100, sells: 0 } },
          },
        ],
      }),
    );

    const [result] = await service.search('rug');

    expect(result.safetyScore).toBe(0);
  });

  it('falls back to GeckoTerminal when DexScreener fails', async () => {
    cache.get.mockResolvedValue(undefined);
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(null, false, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              attributes: {
                address: '0xgecko',
                name: 'Gecko Token',
                reserve_in_usd: '2000',
              },
              relationships: { dex: { data: { id: 'aerodrome' } } },
            },
          ],
        }),
      );

    const [result] = await service.search('gecko');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.address).toBe('0xgecko');
    expect(result.dexId).toBe('aerodrome');
    expect(result.liquidityUsd).toBe(2000);
  });

  it('returns an empty list when both providers fail', async () => {
    cache.get.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValue(jsonResponse(null, false, 500));

    const result = await service.search('nothing');

    expect(result).toEqual([]);
  });
});
