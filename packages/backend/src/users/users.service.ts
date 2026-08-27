import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Readable } from 'stream';
import { stringify } from 'csv-stringify';
import { User } from './user.entity';
import { UserFollows } from './user-follows.entity';
import { UserSettings } from './user-settings.entity';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { NotificationEventsService } from '../notifications/notification-events.service';

export type ExportFormat = 'csv' | 'json';

/** Hard cap on rows returned by a single export, to bound memory/response size. */
export const MAX_EXPORT_ROWS = 10_000;

/** One row in the exported history. */
export interface HistoryRow {
  call_id: string;
  title: string;
  chain: string;
  status: string;
  /** 'yes' = user backed, 'no' = user challenged */
  position: string;
  stake_yes: string;
  stake_no: string;
  outcome: string;
  final_price: string;
  /** Estimated PnL based on pool-proportional payout model */
  pnl: string;
  start_ts: string;
  end_ts: string;
  created_at: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserFollows)
    private userFollowsRepository: Repository<UserFollows>,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    private notificationEventsService: NotificationEventsService,
    private dataSource: DataSource,
  ) {}

  async create(data: {
    wallet: string;
    handle?: string;
    bio?: string;
    displayName?: string;
    avatarCid?: string;
  }): Promise<User> {
    const existing = await this.findByWallet(data.wallet);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    if (data.handle) {
      const handleExists = await this.findByHandle(data.handle);
      if (handleExists) {
        throw new ConflictException('Handle already taken');
      }
    }

    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async findByWallet(wallet: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { wallet } });
  }

  async findByHandle(handle: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { handle } });
  }

  async updateProfile(
    wallet: string,
    updateData: {
      handle?: string;
      bio?: string;
      displayName?: string;
      avatarCid?: string;
    },
  ): Promise<User> {
    const user = await this.findByWallet(wallet);
    if (!user) {
      throw new Error('User not found');
    }

    if (updateData.handle) {
      const existingUser = await this.findByHandle(updateData.handle);
      if (existingUser && existingUser.wallet !== wallet) {
        throw new ConflictException('Handle already taken');
      }
    }

    Object.assign(user, updateData);
    return this.usersRepository.save(user);
  }

  async follow(followerWallet: string, followingWallet: string): Promise<void> {
    if (followerWallet === followingWallet) {
      throw new ConflictException('Cannot follow yourself');
    }

    const existing = await this.userFollowsRepository.findOne({
      where: { followerWallet, followingWallet },
    });

    if (existing) {
      return; // Already following
    }

    const follow = this.userFollowsRepository.create({
      followerWallet,
      followingWallet,
    });
    await this.userFollowsRepository.save(follow);

    const followerUser = await this.usersRepository.findOne({
      where: { wallet: followerWallet },
    });
    this.notificationEventsService.emitNewFollower({
      follower: followerWallet,
      followerHandle: followerUser?.handle ?? undefined,
      followerAvatar: followerUser?.avatarCid ?? undefined,
      followedWallet: followingWallet,
    });
  }

  async unfollow(
    followerWallet: string,
    followingWallet: string,
  ): Promise<void> {
    await this.userFollowsRepository.delete({
      followerWallet,
      followingWallet,
    });
  }

  async getSocialStats(
    wallet: string,
  ): Promise<{ followersCount: number; followingCount: number }> {
    const followersCount = await this.userFollowsRepository.count({
      where: { followingWallet: wallet },
    });
    const followingCount = await this.userFollowsRepository.count({
      where: { followerWallet: wallet },
    });
    return { followersCount, followingCount };
  }

  async getReferralStats(
    wallet: string,
  ): Promise<{ successfulReferralCount: number }> {
    const successfulReferralCount = await this.usersRepository.count({
      where: { referredByWallet: wallet },
    });
    return { successfulReferralCount };
  }

  async isFollowing(
    followerWallet: string,
    followingWallet: string,
  ): Promise<boolean> {
    const count = await this.userFollowsRepository.count({
      where: { followerWallet, followingWallet },
    });
    return count > 0;
  }

  // ─── User settings ─────────────────────────────────────────────────────────

  /**
   * Creates a UserSettings row with all defaults for a newly registered user.
   * Idempotent — silently skips if a row already exists.
   */
  async createDefaultSettings(wallet: string): Promise<UserSettings> {
    const existing = await this.userSettingsRepository.findOne({
      where: { wallet },
    });
    if (existing) return existing;

    const settings = this.userSettingsRepository.create({ wallet });
    return this.userSettingsRepository.save(settings);
  }

  /**
   * Returns the settings row for the given wallet.
   * Creates one with defaults first if it doesn't exist yet (safe for
   * accounts that pre-date this feature).
   */
  async getSettings(wallet: string): Promise<UserSettings> {
    const settings = await this.userSettingsRepository.findOne({
      where: { wallet },
    });
    if (settings) return settings;

    // Back-fill default settings for pre-existing accounts
    return this.createDefaultSettings(wallet);
  }

  /**
   * Partially updates the settings row.  Only keys present in the DTO are
   * written — undefined keys are left untouched (true PATCH semantics).
   * `emailAddress: null` explicitly clears the stored email.
   */
  async upsertSettings(
    wallet: string,
    dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    const user = await this.usersRepository.findOne({ where: { wallet } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure the row exists before patching
    let settings = await this.userSettingsRepository.findOne({
      where: { wallet },
    });
    if (!settings) {
      settings = await this.createDefaultSettings(wallet);
    }

    // Only assign keys that were explicitly supplied in the request body
    const updatable = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    Object.assign(settings, updatable);

    return this.userSettingsRepository.save(settings);
  }

  // ─── Export history ────────────────────────────────────────────────────────

  /**
   * Streams the user's prediction history as either CSV or JSON.
   *
   * Uses a raw SQL cursor via QueryRunner to avoid loading all rows into
   * memory at once — safe for users with thousands of stakes/calls.
   *
   * PnL model (mirrors the on-chain formula):
   *   - Creator always backs "YES" (they created the call).
   *   - If outcome = true  (YES wins):  pnl = totalStakeNo   (profit from losers)
   *   - If outcome = false (NO  wins):  pnl = -totalStakeYes (lost their backing)
   *   - If unresolved:                  pnl = 0
   */
  async exportHistory(wallet: string, format: ExportFormat): Promise<Readable> {
    // PostgreSQL streams rows via QueryRunner — no full result materialised
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    const SQL = `
      SELECT
        c.id::text                              AS call_id,
        COALESCE(c.condition_json->>'title', c.ipfs_cid, '')   AS title,
        c.chain,
        c.status,
        'yes'                                   AS position,
        c.total_stake_yes::text                 AS stake_yes,
        c.total_stake_no::text                  AS stake_no,
        CASE
          WHEN c.outcome IS NULL THEN 'pending'
          WHEN c.outcome = true  THEN 'YES'
          ELSE 'NO'
        END                                     AS outcome,
        COALESCE(c.final_price::text, '')       AS final_price,
        CASE
          WHEN c.outcome IS NULL                    THEN '0'
          WHEN c.outcome = true                     THEN c.total_stake_no::text
          ELSE ('-' || c.total_stake_yes::text)
        END                                     AS pnl,
        c.start_ts::text,
        c.end_ts::text,
        c.created_at::text
      FROM "call" c
      WHERE c.creator_wallet = $1
        AND c.is_hidden = false
      ORDER BY c.created_at DESC
      LIMIT ${MAX_EXPORT_ROWS}
    `;

    // pg-level stream — yields one row object at a time
    const pgStream = await queryRunner.stream(SQL, [wallet]);

    if (format === 'json') {
      return this.toJsonStream(pgStream, queryRunner);
    }

    return this.toCsvStream(pgStream, queryRunner);
  }

  // ─── Private stream helpers ────────────────────────────────────────────────

  /**
   * Wraps the pg row stream in a JSON array stream.
   * Emits: `[\n`, then `{...},\n` per row, then `]\n`.
   */
  private toJsonStream(
    pgStream: Readable,
    queryRunner: import('typeorm').QueryRunner,
  ): Readable {
    let first = true;

    // `read()` resumes the paused pg source once the consumer has drained
    // enough of `output`'s internal buffer — this is what makes the stream
    // backpressure-safe instead of buffering the whole export in memory.
    const output = new Readable({
      read() {
        pgStream.resume();
      },
    });

    pgStream.pause();

    output.push('[\n');

    pgStream.on('data', (row: Record<string, unknown>) => {
      const prefix = first ? '  ' : ',\n  ';
      first = false;
      const canContinue = output.push(prefix + JSON.stringify(row));
      if (!canContinue) {
        // output's internal buffer is full — stop pulling rows from
        // Postgres until `read()` above signals the consumer caught up.
        pgStream.pause();
      }
    });

    pgStream.on('end', () => {
      output.push('\n]\n');
      output.push(null); // signal EOF
      void queryRunner.release();
    });

    pgStream.on('error', (err) => {
      output.destroy(err);
      void queryRunner.release();
    });

    return output;
  }

  /**
   * Pipes the pg row stream through csv-stringify's transform stream.
   * The first row's keys become the CSV header.
   */
  private toCsvStream(
    pgStream: Readable,
    queryRunner: import('typeorm').QueryRunner,
  ): Readable {
    const csvTransform = stringify({
      header: true,
      columns: [
        { key: 'call_id', header: 'Call ID' },
        { key: 'title', header: 'Title' },
        { key: 'chain', header: 'Chain' },
        { key: 'status', header: 'Status' },
        { key: 'position', header: 'Position' },
        { key: 'stake_yes', header: 'Stake YES' },
        { key: 'stake_no', header: 'Stake NO' },
        { key: 'outcome', header: 'Outcome' },
        { key: 'final_price', header: 'Final Price' },
        { key: 'pnl', header: 'PnL' },
        { key: 'start_ts', header: 'Start' },
        { key: 'end_ts', header: 'End' },
        { key: 'created_at', header: 'Created At' },
      ],
    });

    pgStream.pipe(csvTransform);

    pgStream.on('error', (err) => {
      csvTransform.destroy(err);
      void queryRunner.release();
    });

    csvTransform.on('end', () => void queryRunner.release());
    csvTransform.on('error', () => void queryRunner.release());

    return csvTransform as unknown as Readable;
  }
}
