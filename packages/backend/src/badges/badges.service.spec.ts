import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadgesService } from './badges.service';
import { UserBadge } from './badge.entity';
import { BadgeKey } from './badge-definitions';

describe('BadgesService', () => {
  let service: BadgesService;
  let userBadgeRepo: Repository<UserBadge>;
  let dataSource: DataSource;
  let eventEmitter: { emit: jest.Mock };

  const mockUserBadgeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    mockUserBadgeRepo.find.mockReset();
    mockUserBadgeRepo.findOne.mockReset();
    mockUserBadgeRepo.save.mockReset();
    mockUserBadgeRepo.create.mockReset();
    mockDataSource.query.mockReset();

    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        {
          provide: getRepositoryToken(UserBadge),
          useValue: mockUserBadgeRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
    userBadgeRepo = module.get<Repository<UserBadge>>(
      getRepositoryToken(UserBadge),
    );
    dataSource = module.get<DataSource>(DataSource);

    mockUserBadgeRepo.create.mockImplementation((data) => data);
    mockUserBadgeRepo.save.mockResolvedValue({});
  });

  describe('getUserBadges', () => {
    it('should return user badges ordered by grantedAt', async () => {
      const wallet = '0x123';
      const badges = [
        { id: '1', wallet, badge: BadgeKey.FIRST_CALL, grantedAt: new Date() },
        { id: '2', wallet, badge: BadgeKey.FIVE_WINS, grantedAt: new Date() },
      ];
      mockUserBadgeRepo.find.mockResolvedValue(badges);

      const result = await service.getUserBadges(wallet);

      expect(mockUserBadgeRepo.find).toHaveBeenCalledWith({
        where: { wallet },
        order: { grantedAt: 'ASC' },
      });
      expect(result).toEqual(badges);
    });
  });

  describe('checkAndGrantBadges', () => {
    const wallet = '0x123';

    it('should grant badges when thresholds are met', async () => {
      // callCount, winsCount, totalStake, followerCount, streak, oracleSlayer
      mockDataSource.query
        .mockResolvedValueOnce([{ cnt: '5' }]) // callCount
        .mockResolvedValueOnce([{ cnt: '7' }]) // winsCount
        .mockResolvedValueOnce([{ total: '1500.5' }]) // totalStake
        .mockResolvedValueOnce([{ cnt: '12' }]) // followerCount
        .mockResolvedValueOnce([
          { outcome: true },
          { outcome: true },
          { outcome: true },
        ]) // streak = 3
        .mockResolvedValueOnce([{ cnt: '3' }]); // oracleSlayer

      mockUserBadgeRepo.findOne.mockResolvedValue(null);

      await service.checkAndGrantBadges(wallet);

      // FIRST_CALL, FIVE_WINS, WHALE_STAKER, SOCIAL_BUTTERFLY, STREAK, ORACLE_SLAYER
      expect(mockUserBadgeRepo.findOne).toHaveBeenCalledTimes(6);
      expect(mockUserBadgeRepo.create).toHaveBeenCalledTimes(6);
      expect(mockUserBadgeRepo.save).toHaveBeenCalledTimes(6);
    });

    it('should not grant badges already earned', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ cnt: '5' }])
        .mockResolvedValueOnce([{ cnt: '7' }])
        .mockResolvedValueOnce([{ total: '1500.5' }])
        .mockResolvedValueOnce([{ cnt: '12' }])
        .mockResolvedValueOnce([
          { outcome: true },
          { outcome: true },
          { outcome: true },
        ])
        .mockResolvedValueOnce([{ cnt: '3' }]);

      mockUserBadgeRepo.findOne
        .mockResolvedValueOnce(null) // FIRST_CALL new
        .mockResolvedValueOnce({ id: '1', wallet, badge: BadgeKey.FIVE_WINS }) // already earned
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.checkAndGrantBadges(wallet);

      expect(mockUserBadgeRepo.create).toHaveBeenCalledTimes(5);
      expect(mockUserBadgeRepo.save).toHaveBeenCalledTimes(5);
    });

    it('should grant no badges when no thresholds are met', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ cnt: '0' }]) // callCount
        .mockResolvedValueOnce([{ cnt: '2' }]) // winsCount
        .mockResolvedValueOnce([{ total: '500' }]) // totalStake
        .mockResolvedValueOnce([{ cnt: '5' }]) // followerCount
        .mockResolvedValueOnce([{ outcome: false }]) // streak = 0
        .mockResolvedValueOnce([{ cnt: '0' }]); // oracleSlayer

      await service.checkAndGrantBadges(wallet);

      expect(mockUserBadgeRepo.findOne).not.toHaveBeenCalled();
      expect(mockUserBadgeRepo.create).not.toHaveBeenCalled();
      expect(mockUserBadgeRepo.save).not.toHaveBeenCalled();
    });

    it('should grant STREAK and HIGH_ROLLER when thresholds are met', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ cnt: '1' }]) // callCount
        .mockResolvedValueOnce([{ cnt: '0' }]) // winsCount
        .mockResolvedValueOnce([{ total: '12000' }]) // totalStake >= 10k
        .mockResolvedValueOnce([{ cnt: '0' }]) // followerCount
        .mockResolvedValueOnce([
          { outcome: true },
          { outcome: true },
          { outcome: true },
          { outcome: true },
        ]) // streak = 4
        .mockResolvedValueOnce([{ cnt: '0' }]); // oracleSlayer

      mockUserBadgeRepo.findOne.mockResolvedValue(null);

      await service.checkAndGrantBadges(wallet);

      // FIRST_CALL, WHALE_STAKER, STREAK, HIGH_ROLLER
      expect(mockUserBadgeRepo.create).toHaveBeenCalledTimes(4);
    });

    it('should handle database errors gracefully', async () => {
      mockDataSource.query.mockRejectedValue(new Error('db down'));
      await service.checkAndGrantBadges(wallet);
      expect(mockUserBadgeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('grantIfNew', () => {
    it('should grant a badge and emit a notification when new', async () => {
      mockUserBadgeRepo.findOne.mockResolvedValue(null);
      mockUserBadgeRepo.create.mockReturnValue({
        wallet: '0x123',
        badge: BadgeKey.FIRST_CALL,
      });
      mockUserBadgeRepo.save.mockResolvedValue({});

      await (service as any).grantIfNew('0x123', BadgeKey.FIRST_CALL);

      expect(mockUserBadgeRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.notification',
        expect.objectContaining({ type: 'badge.awarded' }),
      );
    });

    it('should not grant a badge that already exists', async () => {
      mockUserBadgeRepo.findOne.mockResolvedValue({
        id: '1',
        wallet: '0x123',
        badge: BadgeKey.FIRST_CALL,
      });

      await (service as any).grantIfNew('0x123', BadgeKey.FIRST_CALL);

      expect(mockUserBadgeRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('threshold queries', () => {
    const wallet = '0x123';
    const normalizeSql = (s: string) => s.replace(/\s+/g, ' ').trim();

    it('getCallCount counts non-hidden calls', async () => {
      mockDataSource.query.mockResolvedValue([{ cnt: '5' }]);
      const result = await (service as any).getCallCount(wallet);
      const [q, p] = (mockDataSource.query as any).mock.calls[0];
      expect(normalizeSql(q)).toContain('is_hidden = false');
      expect(p).toEqual([wallet]);
      expect(result).toBe(5);
    });

    it('getWinsCount counts resolved winning calls', async () => {
      mockDataSource.query.mockResolvedValue([{ cnt: '3' }]);
      const result = await (service as any).getWinsCount(wallet);
      expect(result).toBe(3);
    });

    it('getStreak returns trailing consecutive wins', async () => {
      mockDataSource.query.mockResolvedValue([
        { outcome: true },
        { outcome: true },
        { outcome: false },
        { outcome: true },
      ]);
      const result = await (service as any).getStreak(wallet);
      expect(result).toBe(2);
    });

    it('getOracleSlayerCount counts underdog wins', async () => {
      mockDataSource.query.mockResolvedValue([{ cnt: '4' }]);
      const result = await (service as any).getOracleSlayerCount(wallet);
      expect(result).toBe(4);
    });
  });
});
