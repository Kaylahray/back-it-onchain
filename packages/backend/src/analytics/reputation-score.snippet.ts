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
// import { User } from '../users/entities/user.entity';
// import { Call } from '../calls/entities/call.entity';

@Injectable()
export class ReputationScoreSnippet {
  constructor(
    @InjectRepository('User') private readonly userRepo: Repository<any>,
    @InjectRepository('Call') private readonly callRepo: Repository<any>,
  ) {}

  async computeAndPersistReputation(userId: string): Promise<number> {
    const [totalResolvedCalls, winCount] = await Promise.all([
      this.callRepo.count({
        where: { userId, status: 'resolved' },
      }),
      this.callRepo.count({
        where: { userId, status: 'resolved', outcome: 'win' },
      }),
    ]);

    const reputationScore = computeReputationScore({
      totalResolvedCalls,
      winCount,
    });

    await this.userRepo.update({ id: userId }, { reputationScore });

    return reputationScore;
  }

  async getReputationScore(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['reputationScore'],
    });

    if (!user) return 0;

    if (user.reputationScore !== null && user.reputationScore !== undefined) {
      return user.reputationScore;
    }

    return this.computeAndPersistReputation(userId);
  }
}
