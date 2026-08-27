import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsChainFilter } from './dto/overview-query.dto';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let cache: { get: jest.Mock; set: jest.Mock };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    cache = { get: jest.fn(), set: jest.fn() };
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverview', () => {
    it('returns a cached overview without querying the database', async () => {
      const cached = { totalCalls: 5 } as any;
      cache.get.mockResolvedValue(cached);

      const result = await service.getOverview();

      expect(result).toBe(cached);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('aggregates totals, win rate, and active users on a cache miss', async () => {
      cache.get.mockResolvedValue(undefined);
      dataSource.query
        .mockResolvedValueOnce([
          { totalCalls: 10, totalVolume: 500, wins: 3, losses: 1, pending: 6 },
        ])
        .mockResolvedValueOnce([{ count: 4 }])
        .mockResolvedValueOnce([{ count: 9 }]);

      const result = await service.getOverview();

      expect(result).toEqual({
        totalCalls: 10,
        totalVolume: 500,
        activeUsers24h: 4,
        activeUsers7d: 9,
        winRateDistribution: {
          wins: 3,
          losses: 1,
          pending: 6,
          winRatePercent: 75,
        },
      });
      expect(cache.set).toHaveBeenCalledWith(
        'analytics:overview:all',
        result,
        2 * 60 * 1000,
      );
    });

    it('scopes the query to a single chain and uses a distinct cache key', async () => {
      cache.get.mockResolvedValue(undefined);
      dataSource.query
        .mockResolvedValueOnce([
          { totalCalls: 0, totalVolume: 0, wins: 0, losses: 0, pending: 0 },
        ])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }]);

      await service.getOverview(AnalyticsChainFilter.STELLAR);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.chain = $1'),
        [AnalyticsChainFilter.STELLAR],
      );
      expect(cache.set).toHaveBeenCalledWith(
        'analytics:overview:stellar',
        expect.any(Object),
        2 * 60 * 1000,
      );
    });

    it('reports a 0% win rate when nothing has resolved yet', async () => {
      cache.get.mockResolvedValue(undefined);
      dataSource.query
        .mockResolvedValueOnce([
          { totalCalls: 2, totalVolume: 100, wins: 0, losses: 0, pending: 2 },
        ])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 1 }]);

      const result = await service.getOverview();

      expect(result.winRateDistribution.winRatePercent).toBe(0);
    });
  });

  describe('overviewToCsv', () => {
    it('renders the overview as a single-row CSV with a header', () => {
      const csv = service.overviewToCsv({
        totalCalls: 10,
        totalVolume: 500,
        activeUsers24h: 4,
        activeUsers7d: 9,
        winRateDistribution: {
          wins: 3,
          losses: 1,
          pending: 6,
          winRatePercent: 75,
        },
      });

      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe(
        'totalCalls,totalVolume,activeUsers24h,activeUsers7d,wins,losses,pending,winRatePercent',
      );
      expect(lines[1]).toBe('10,500,4,9,3,1,6,75');
    });
  });
});
