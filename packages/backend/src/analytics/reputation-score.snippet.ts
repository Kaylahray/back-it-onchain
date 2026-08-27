/**
 * DROP THIS METHOD INTO AnalyticsService AND CALL IT WHEREVER
 * USER STATS ARE QUERIED OR UPDATED.
 *
 * Import at top of analytics.service.ts:
 *   import { computeReputationScore } from './reputation.util';
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeReputationScore } from './reputation.util';

// --- Replace User / Call with your actual entity imports ---
import { User } from '../users/user.entity';
import { Call } from '../calls/call.entity';

@Injectable()
export class ReputationScoreSnippet {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Call) private readonly callRepo: Repository<Call>,
  ) {}

  async computeAndPersistReputation(userId: string): Promise<number> {
    const resolvedCalls = await this.callRepo.find({
      where: { creatorWallet: userId, status: 'resolved' },
      select: ['outcome', 'totalStakeYes', 'totalStakeNo', 'endTs'],
    });

    const reputationScore = computeReputationScore(
      resolvedCalls.map((c) => ({
        outcome: c.outcome ?? null,
        stakeAmount: (c.totalStakeYes ?? 0) + (c.totalStakeNo ?? 0),
        resolvedAt: c.endTs,
      })),
    );

    await this.userRepo.update({ wallet: userId }, { reputationScore });

    return reputationScore;
  }

  async getReputationScore(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { wallet: userId },
      select: ['reputationScore'],
    });

    if (!user) return 0;

    if (user.reputationScore !== null && user.reputationScore !== undefined) {
      return user.reputationScore;
    }

    return this.computeAndPersistReputation(userId);
  }
}
