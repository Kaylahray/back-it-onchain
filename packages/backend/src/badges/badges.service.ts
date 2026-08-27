import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserBadge } from './badge.entity';
import { BadgeKey, BADGE_DEFINITIONS } from './badge-definitions';

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    @InjectRepository(UserBadge)
    private readonly userBadgeRepo: Repository<UserBadge>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getUserBadges(wallet: string): Promise<UserBadge[]> {
    return this.userBadgeRepo.find({
      where: { wallet },
      order: { grantedAt: 'ASC' },
    });
  }

  /**
   * Evaluate all badge thresholds for a wallet and grant any newly earned ones.
   * Runs asynchronously — callers should not await if they want non-blocking
   * behaviour. All DB checks run in parallel; granting is idempotent via the
   * unique constraint. Newly granted badges trigger a `user.notification`.
   */
  async checkAndGrantBadges(wallet: string): Promise<void> {
    try {
      const [callCount, winsCount, totalStake, followerCount, streak, oracleSlayer] =
        await Promise.all([
          this.getCallCount(wallet),
          this.getWinsCount(wallet),
          this.getTotalStake(wallet),
          this.getFollowerCount(wallet),
          this.getStreak(wallet),
          this.getOracleSlayerCount(wallet),
        ]);

      const earned: BadgeKey[] = [];
      if (callCount >= 1) earned.push(BadgeKey.FIRST_CALL);
      if (winsCount >= 5) earned.push(BadgeKey.FIVE_WINS);
      if (winsCount >= 10) earned.push(BadgeKey.TEN_WINS);
      if (totalStake >= 1000) earned.push(BadgeKey.WHALE_STAKER);
      if (followerCount >= 10) earned.push(BadgeKey.SOCIAL_BUTTERFLY);
      if (streak >= 3) earned.push(BadgeKey.STREAK);
      if (totalStake >= 10_000) earned.push(BadgeKey.HIGH_ROLLER);
      if (oracleSlayer >= 3) earned.push(BadgeKey.ORACLE_SLAYER);

      await Promise.all(earned.map((badge) => this.grantIfNew(wallet, badge)));
    } catch (err) {
      this.logger.error(
        `Badge check failed for ${wallet}: ${(err as Error).message}`,
      );
    }
  }

  private async grantIfNew(wallet: string, badge: BadgeKey): Promise<void> {
    const existing = await this.userBadgeRepo.findOne({
      where: { wallet, badge },
    });
    if (existing) return;

    await this.userBadgeRepo.save(this.userBadgeRepo.create({ wallet, badge }));
    const definition = BADGE_DEFINITIONS.find((d) => d.key === badge);
    this.logger.log(`Granted badge [${badge}] to ${wallet}`);

    this.eventEmitter.emit('user.notification', {
      userId: wallet,
      type: 'badge.awarded',
      payload: { badge, name: definition?.name, description: definition?.description },
    });
  }

  // ─── Threshold queries ───────────────────────────────────────────────────

  private async getCallCount(wallet: string): Promise<number> {
    const [row] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::int AS cnt FROM "call"
       WHERE creator_wallet = $1 AND is_hidden = false`,
      [wallet],
    );
    return parseInt(row.cnt, 10);
  }

  private async getWinsCount(wallet: string): Promise<number> {
    const [row] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::int AS cnt FROM "call"
       WHERE creator_wallet = $1 AND status = 'RESOLVED' AND outcome = true`,
      [wallet],
    );
    return parseInt(row.cnt, 10);
  }

  private async getTotalStake(wallet: string): Promise<number> {
    const [row] = await this.dataSource.query<[{ total: string }]>(
      `SELECT COALESCE(SUM(total_stake_yes + total_stake_no), 0) AS total
       FROM "call" WHERE creator_wallet = $1 AND is_hidden = false`,
      [wallet],
    );
    return parseFloat(row.total ?? '0');
  }

  private async getFollowerCount(wallet: string): Promise<number> {
    const [row] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::int AS cnt FROM user_follows
       WHERE following_wallet = $1`,
      [wallet],
    );
    return parseInt(row.cnt, 10);
  }

  private async getStreak(wallet: string): Promise<number> {
    const rows = await this.dataSource.query<Array<{ outcome: boolean }>>(
      `SELECT outcome FROM "call"
       WHERE creator_wallet = $1 AND status = 'RESOLVED'
       ORDER BY updated_at DESC`,
      [wallet],
    );
    let streak = 0;
    for (const row of rows) {
      if (row.outcome === true) streak += 1;
      else break;
    }
    return streak;
  }

  private async getOracleSlayerCount(wallet: string): Promise<number> {
    const [row] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::int AS cnt FROM "call"
       WHERE creator_wallet = $1
         AND status = 'RESOLVED'
         AND outcome = true
         AND total_stake_no > total_stake_yes`,
      [wallet],
    );
    return parseInt(row.cnt, 10);
  }
}
