import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { FeedService } from './feed.service';
import { Call } from '../calls/call.entity';
import { StakeActivity } from '../calls/stake-activity.entity';
import { UserFollows } from '../users/user-follows.entity';

const mockCall = (overrides: Partial<Call> = {}): Call =>
  ({
    id: 1,
    title: 'Test Call',
    description: 'A test prediction call',
    callOnchainId: '1',
    creatorWallet: '0xABC',
    ipfsCid: 'Qm123',
    tokenAddress: '0xTOKEN',
    pairId: null,
    stakeToken: '0xSTAKE',
    totalStakeYes: 400,
    totalStakeNo: 100,
    startTs: new Date('2026-01-01'),
    endTs: new Date('2026-06-01'),
    conditionJson: null,
    status: 'OPEN',
    outcome: null,
    finalPrice: null,
    oracleSignature: null,
    evidenceCid: null,
    chain: 'base',
    isHidden: false,
    reportCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    creator: null,
    ...overrides,
  }) as Call;

describe('FeedService', () => {
  let service: FeedService;
  let callRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let userFollowsRepository: {
    find: jest.Mock;
  };
  let stakeActivityRepository: {
    createQueryBuilder: jest.Mock;
  };
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
  };

  // Query builder mock for the trending raw query (call + stake_activity join)
  const buildTrendingQbMock = (rows: Array<any>) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  beforeEach(async () => {
    callRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    userFollowsRepository = {
      find: jest.fn(),
    };

    stakeActivityRepository = {
      createQueryBuilder: jest.fn(),
    };

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        {
          provide: getRepositoryToken(Call),
          useValue: callRepository,
        },
        {
          provide: getRepositoryToken(UserFollows),
          useValue: userFollowsRepository,
        },
        {
          provide: getRepositoryToken(StakeActivity),
          useValue: stakeActivityRepository,
        },
        {
          provide: 'CACHE_MANAGER',
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFollowingFeed', () => {
    it('returns empty array when the user follows nobody', async () => {
      userFollowsRepository.find.mockResolvedValue([]);

      const result = await service.getFollowingFeed('0xUSER');

      expect(result).toEqual([]);
      expect(callRepository.find).not.toHaveBeenCalled();
    });

    it('queries calls from followed wallets only', async () => {
      const follows: Partial<UserFollows>[] = [
        { followingWallet: '0xALICE' },
        { followingWallet: '0xBOB' },
      ];
      userFollowsRepository.find.mockResolvedValue(follows);

      const calls = [
        mockCall({ id: 1, creatorWallet: '0xALICE' }),
        mockCall({ id: 2, creatorWallet: '0xBOB' }),
      ];
      callRepository.find.mockResolvedValue(calls);

      const result = await service.getFollowingFeed('0xUSER');

      expect(userFollowsRepository.find).toHaveBeenCalledWith({
        where: { followerWallet: '0xUSER' },
        select: ['followingWallet'],
      });
      expect(callRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isHidden: false }),
          order: { createdAt: 'DESC' },
          relations: ['creator'],
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('excludes hidden calls', async () => {
      userFollowsRepository.find.mockResolvedValue([
        { followingWallet: '0xALICE' },
      ]);

      const visibleCall = mockCall({ id: 1, isHidden: false });
      callRepository.find.mockResolvedValue([visibleCall]);

      await service.getFollowingFeed('0xUSER');

      const findArgs = callRepository.find.mock.calls[0][0];
      expect(findArgs.where).toMatchObject({ isHidden: false });
    });

    it('applies limit and offset pagination', async () => {
      userFollowsRepository.find.mockResolvedValue([
        { followingWallet: '0xALICE' },
      ]);
      callRepository.find.mockResolvedValue([]);

      await service.getFollowingFeed('0xUSER', 5, 10);

      const findArgs = callRepository.find.mock.calls[0][0];
      expect(findArgs.take).toBe(5);
      expect(findArgs.skip).toBe(10);
    });

    it('uses default limit=20 and offset=0', async () => {
      userFollowsRepository.find.mockResolvedValue([
        { followingWallet: '0xALICE' },
      ]);
      callRepository.find.mockResolvedValue([]);

      await service.getFollowingFeed('0xUSER');

      const findArgs = callRepository.find.mock.calls[0][0];
      expect(findArgs.take).toBe(20);
      expect(findArgs.skip).toBe(0);
    });

    it('orders results by createdAt DESC (newest first)', async () => {
      userFollowsRepository.find.mockResolvedValue([
        { followingWallet: '0xALICE' },
      ]);

      const older = mockCall({ id: 1, createdAt: new Date('2026-01-01') });
      const newer = mockCall({ id: 2, createdAt: new Date('2026-03-01') });
      callRepository.find.mockResolvedValue([newer, older]);

      const result = await service.getFollowingFeed('0xUSER');

      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it('includes creator relation', async () => {
      userFollowsRepository.find.mockResolvedValue([
        { followingWallet: '0xALICE' },
      ]);
      callRepository.find.mockResolvedValue([]);

      await service.getFollowingFeed('0xUSER');

      const findArgs = callRepository.find.mock.calls[0][0];
      expect(findArgs.relations).toContain('creator');
    });
  });

  // The trending raw query drives BOTH forYou and trending surfaces.
  const stubTrending = ({
    rows,
    calls,
    totalStakeYes = 400,
    totalStakeNo = 100,
  }: {
    rows: Array<any>;
    calls: Call[];
    totalStakeYes?: number;
    totalStakeNo?: number;
  }) => {
    const qb = buildTrendingQbMock(rows);
    callRepository.createQueryBuilder.mockReturnValue(qb);
    callRepository.find.mockResolvedValue(calls);
    return qb;
  };

  describe('getForYouFeed', () => {
    it('ranks calls by the trending score formula', async () => {
      const highCall = mockCall({ id: 2, totalStakeYes: 2000, totalStakeNo: 1000 });
      const lowCall = mockCall({ id: 1, totalStakeYes: 10, totalStakeNo: 5 });
      stubTrending({
        rows: [
          {
            callId: '2',
            callOnchainId: '2',
            totalStake: '3000',
            createdAt: Date.now().toString(),
            volume24h: '0',
            participantCount24h: '0',
          },
          {
            callId: '1',
            callOnchainId: '1',
            totalStake: '15',
            createdAt: Date.now().toString(),
            volume24h: '0',
            participantCount24h: '0',
          },
        ],
        calls: [highCall, lowCall],
      });

      const result = await service.getForYouFeed();

      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it('excludes hidden calls in the raw query', async () => {
      const qb = stubTrending({ rows: [], calls: [] });

      await service.getForYouFeed();

      expect(qb.where).toHaveBeenCalledWith('call.isHidden = :isHidden', {
        isHidden: false,
      });
    });

    it('selects total_stake expression', async () => {
      const qb = stubTrending({ rows: [], calls: [] });

      await service.getForYouFeed();

      expect(qb.addSelect).toHaveBeenCalledWith(
        'call.totalStakeYes + call.totalStakeNo',
        'totalStake',
      );
    });

    it('joins stake_activity for 24h aggregates', async () => {
      const qb = stubTrending({ rows: [], calls: [] });

      await service.getForYouFeed();

      expect(qb.leftJoin).toHaveBeenCalledWith(
        StakeActivity,
        'activity',
        expect.stringContaining('activity.callOnchainId'),
        expect.any(Object),
      );
    });

    it('returns empty array when no calls exist', async () => {
      stubTrending({ rows: [], calls: [] });

      const result = await service.getForYouFeed();

      expect(result).toEqual([]);
    });
  });

  describe('getTrendingFeed', () => {
    it('returns cached trending results if available', async () => {
      const trendingItem = {
        ...mockCall({ id: 1 }),
        trendingScore: 100,
        isHot: true,
        totalStake: 500,
        volume24h: 500,
        participantCount24h: 5,
      };

      cacheManager.get.mockResolvedValue([trendingItem]);

      const result = await service.getTrendingFeed(10, 0);
      expect(cacheManager.get).toHaveBeenCalledWith('feed:trending:24h');
      expect(result).toEqual([trendingItem]);
    });

    it('computes trending using the scoring formula on cache miss', async () => {
      cacheManager.get.mockResolvedValue(null);

      const call = mockCall({
        id: 1,
        callOnchainId: '123',
        totalStakeYes: 400,
        totalStakeNo: 100,
        createdAt: new Date(),
      });

      const qb = buildTrendingQbMock([
        {
          callId: '1',
          callOnchainId: '123',
          totalStake: '500',
          createdAt: new Date().toString(),
          volume24h: '500',
          participantCount24h: '10',
        },
      ]);
      callRepository.createQueryBuilder.mockReturnValue(qb);
      callRepository.find.mockResolvedValue([call]);

      const result = await service.getTrendingFeed(10, 0);

      expect(callRepository.createQueryBuilder).toHaveBeenCalledWith('call');
      expect(qb.leftJoin).toHaveBeenCalledWith(
        StakeActivity,
        'activity',
        expect.any(String),
        expect.any(Object),
      );
      expect(callRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: In([1]),
            isHidden: false,
          }),
          relations: ['creator'],
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        totalStake: 500,
        volume24h: 500,
        participantCount24h: 10,
      });
      // (500*0.5 + 10*30 + 500*0.2) / ageDecay
      // ageHours is clamped to a 1h floor -> ageDecay = 1 + ln(2) = 1.6931
      const rawScore = 500 * 0.5 + 10 * 30 + 500 * 0.2; // 650
      const decay = 1 + Math.log(2);
      expect(result[0].trendingScore).toBeCloseTo(rawScore / decay, 1);
      expect(cacheManager.set).toHaveBeenCalledWith(
        'feed:trending:24h',
        expect.any(Array),
        300,
      );
    });
  });
});
