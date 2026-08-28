import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Call } from '../calls/call.entity';
import { StakeActivity } from '../calls/stake-activity.entity';
import { UserFollows } from '../users/user-follows.entity';

export interface TrendingCall extends Call {
  trendingScore: number;
  isHot: boolean;
  totalStake: number;
  volume24h: number;
  participantCount24h: number;
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly TRENDING_CACHE_KEY = 'feed:trending:24h';

  constructor(
    @InjectRepository(Call)
    private callRepository: Repository<Call>,
    @InjectRepository(UserFollows)
    private userFollowsRepository: Repository<UserFollows>,
    @InjectRepository(StakeActivity)
    private stakeActivityRepository: Repository<StakeActivity>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async getFollowingFeed(
    wallet: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Call[]> {
    // 1. Get list of wallets the user follows
    const follows = await this.userFollowsRepository.find({
      where: { followerWallet: wallet },
      select: ['followingWallet'],
    });

    const followingWallets = follows.map((f) => f.followingWallet);

    if (followingWallets.length === 0) {
      return [];
    }

    // 2. Get calls from these wallets
    return this.callRepository.find({
      where: { creatorWallet: In(followingWallets), isHidden: false },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['creator'],
    });
  }

  async getForYouFeed(limit: number = 20, offset: number = 0): Promise<Call[]> {
    // For-you feed uses the same trending score as the trending feed, so
    // results are consistent between the two surfaces.
    const trending = await this.calculateTrendingFeed();
    return trending.slice(offset, offset + limit) as unknown as Call[];
  }

  async getTrendingFeed(
    limit: number = 20,
    offset: number = 0,
  ): Promise<TrendingCall[]> {
    const cached = await this.cacheManager.get<TrendingCall[]>(
      this.TRENDING_CACHE_KEY,
    );
    if (Array.isArray(cached) && cached.length > 0) {
      this.logger.debug('Using cached trending feed results');
      return cached.slice(offset, offset + limit);
    }

    const computed = await this.calculateTrendingFeed();
    await this.cacheManager.set(this.TRENDING_CACHE_KEY, computed, 300);

    return computed.slice(offset, offset + limit);
  }

  async refreshTrendingCache(): Promise<TrendingCall[]> {
    const fresh = await this.calculateTrendingFeed();
    await this.cacheManager.set(this.TRENDING_CACHE_KEY, fresh, 300);
    return fresh;
  }

  async calculateTrendingFeed(): Promise<TrendingCall[]> {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rawRows = await this.callRepository
      .createQueryBuilder('call')
      .select('call.id', 'callId')
      .addSelect('call.callOnchainId', 'callOnchainId')
      .addSelect('call.totalStakeYes + call.totalStakeNo', 'totalStake')
      .addSelect('call.createdAt', 'createdAt')
      .addSelect('COALESCE(SUM(activity.amount), 0)', 'volume24h')
      .addSelect(
        'COUNT(DISTINCT activity.stakerWallet)',
        'participantCount24h',
      )
      .leftJoin(
        StakeActivity,
        'activity',
        'activity.callOnchainId = call.callOnchainId ' +
          'AND activity.createdAt >= :windowStart',
        { windowStart },
      )
      .where('call.isHidden = :isHidden', { isHidden: false })
      .groupBy('call.id')
      .addGroupBy('call.callOnchainId')
      .addGroupBy('call.totalStakeYes')
      .addGroupBy('call.totalStakeNo')
      .addGroupBy('call.createdAt')
      .getRawMany<{
        callId: string;
        callOnchainId: string;
        totalStake: string;
        createdAt: string;
        volume24h: string;
        participantCount24h: string;
      }>();

    if (!rawRows.length) {
      return [];
    }

    const callIds = rawRows.map((r) => r.callId);
    const calls = await this.callRepository.find({
      where: { id: In(callIds.map(Number)), isHidden: false },
      relations: ['creator'],
    });

    const callById = new Map(calls.map((call) => [call.id, call]));

    const now = Date.now();
    const trending: TrendingCall[] = rawRows
      .map((row) => {
        const targetCall = callById.get(Number(row.callId));
        if (!targetCall) return null;

        const totalStake = Number(row.totalStake) || 0;
        const volume = Number(row.volume24h) || 0;
        const participants = Number(row.participantCount24h) || 0;

        const createdMs = new Date(row.createdAt).getTime();
        const ageHours = Math.max((now - createdMs) / 3_600_000, 1);
        const ageDecay = 1 + Math.log(1 + ageHours);

        const score =
          (totalStake * 0.5 + participants * 30 + volume * 0.2) / ageDecay;

        return {
          ...targetCall,
          totalStake,
          volume24h: volume,
          participantCount24h: participants,
          trendingScore: Number(score.toFixed(6)),
          isHot: score >= 50,
        } as TrendingCall;
      })
      .filter(Boolean) as TrendingCall[];

    trending.sort((a, b) => b.trendingScore - a.trendingScore);
    return trending;
  }
}
