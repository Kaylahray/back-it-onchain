import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Leaderboard, LeaderboardPeriod } from './entities/leaderboard.entity';

interface AggregateRow {
  user_id: string;
  // PostgreSQL returns numeric/int columns as strings in node-postgres
  total_predictions: string;
  win_count: string;
  win_rate: string;
  profit: string;
  stake_volume: string;
  reputation_score: string;
}

@Injectable()
export class LeaderboardAggregationJob {
  private readonly logger = new Logger(LeaderboardAggregationJob.name);

  private static readonly TOP_N = 100;

  constructor(
    @InjectRepository(Leaderboard)
    private readonly leaderboardRepo: Repository<Leaderboard>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs nightly at 02:00 and rebuilds all leaderboard periods.
   * Can also be triggered manually for backfilling.
   */
  @Cron('0 2 * * *')
  async aggregateAll(): Promise<void> {
    this.logger.log('Leaderboard aggregation started');

    await Promise.all([
      this.aggregatePeriod(LeaderboardPeriod.ALL_TIME),
      this.aggregatePeriod(LeaderboardPeriod.WEEKLY),
      this.aggregatePeriod(LeaderboardPeriod.MONTHLY),
    ]);

    this.logger.log('Leaderboard aggregation complete');
  }

  private periodFilter(period: LeaderboardPeriod): string {
    switch (period) {
      case LeaderboardPeriod.WEEKLY:
        return `AND c.end_ts >= NOW() - INTERVAL '7 days'`;
      case LeaderboardPeriod.MONTHLY:
        return `AND c.end_ts >= NOW() - INTERVAL '30 days'`;
      default:
        return '';
    }
  }

  private async aggregatePeriod(period: LeaderboardPeriod): Promise<void> {
    const periodFilter = this.periodFilter(period);

    // Raw SQL for efficiency on large datasets.
    // "call" must be quoted — it is a reserved word in PostgreSQL 11+.
    // Profit = stakes won from correct calls minus stakes lost on wrong calls.
    // Stake volume = total staked value across a user's resolved calls.
    // Rows are ranked by reputation score + stake volume (ties → higher
    // win_rate wins), capped at the top 100.
    const rows: AggregateRow[] = await this.dataSource.query(
      `
      SELECT
        c.creator_wallet                                                          AS user_id,
        COUNT(*)::int                                                             AS total_predictions,
        COUNT(*) FILTER (WHERE c.outcome = true)::int                            AS win_count,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            COUNT(*) FILTER (WHERE c.outcome = true)::numeric
              / COUNT(*)::numeric * 100,
            2
          )
        END                                                                       AS win_rate,
        COALESCE(SUM(c.total_stake_no)  FILTER (WHERE c.outcome = true),  0) -
        COALESCE(SUM(c.total_stake_yes) FILTER (WHERE c.outcome = false), 0)     AS profit,
        COALESCE(SUM(c.total_stake_yes + c.total_stake_no), 0)                   AS stake_volume,
        COALESCE(u.reputation_score, 0)                                         AS reputation_score
      FROM "call" c
      LEFT JOIN "user" u ON u.wallet = c.creator_wallet
      WHERE c.is_hidden = false
        AND c.status = 'RESOLVED'
        ${periodFilter}
      GROUP BY c.creator_wallet, u.reputation_score
      ORDER BY
        reputation_score DESC,
        stake_volume DESC,
        win_rate DESC,
        profit DESC
      LIMIT ${LeaderboardAggregationJob.TOP_N}
    `,
    );

    if (rows.length === 0) {
      this.logger.log(`[${period}] No resolved calls found — skipping`);
      return;
    }

    const entries = rows.map((row, index) => {
      const entry = new Leaderboard();
      entry.period = period;
      entry.rank = index + 1;
      entry.userId = row.user_id;
      entry.winRate = parseFloat(row.win_rate);
      entry.profit = parseFloat(row.profit);
      entry.stakeVolume = parseFloat(row.stake_volume);
      entry.reputationScore = parseFloat(row.reputation_score);
      entry.totalPredictions = parseInt(row.total_predictions, 10);
      return entry;
    });

    // Upsert atomically: remove stale rows for this period then persist fresh
    // ones, so rankings never accumulate duplicates across runs.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Leaderboard, { period });
      await manager.save(Leaderboard, entries);
    });

    this.logger.log(`[${period}] Rebuilt with ${entries.length} entries`);
  }
}
