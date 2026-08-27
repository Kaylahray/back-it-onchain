import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Call } from './call.entity';
import { Participant } from './participant.entity';
import { Dispute } from './dispute.entity';
import { IpfsService } from '../ipfs/ipfs.service';

type CallsListOptions = {
  chain?: 'base' | 'stellar';
  limit: number;
  offset: number;
};

type CallsListResponse = {
  data: Call[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
};

type CallResponse = {
  data: Call;
  meta: null;
};

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

/** Valid call statuses in lifecycle order. */
export type CallStatus = 'OPEN' | 'SETTLING' | 'RESOLVED' | 'UNRESOLVED' | 'STALE';

const ALLOWED_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  OPEN: ['SETTLING'],
  SETTLING: ['RESOLVED', 'UNRESOLVED'],
  RESOLVED: [],
  UNRESOLVED: ['SETTLING'], // admin force-retry
  STALE: ['SETTLING'],      // admin force-unresolve path
};

function assertTransition(current: CallStatus, next: CallStatus): void {
  if (!(ALLOWED_TRANSITIONS[current] ?? []).includes(next)) {
    throw new BadRequestException(
      `Illegal status transition: ${current} → ${next}`,
    );
  }
}

// ── Payout types ─────────────────────────────────────────────────────────────

export interface ParticipantPayout {
  participantId: string;
  wallet: string;
  stake: number;
  position: boolean;
  payout: number;
  isWinner: boolean;
}

export interface PayoutsResult {
  callId: number;
  outcome: boolean | null;
  totalPool: number;
  feeBps: number;
  netPool: number;
  payouts: ParticipantPayout[];
}

const DEFAULT_FEE_BPS = 200; // 2%

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(Call)
    private callsRepository: Repository<Call>,
    @InjectRepository(Participant)
    private participantsRepository: Repository<Participant>,
    @InjectRepository(Dispute)
    private disputesRepository: Repository<Dispute>,
    private readonly ipfsService: IpfsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Standard CRUD ─────────────────────────────────────────────────────────

  async create(callData: Partial<Call>): Promise<Call> {
    const call = this.callsRepository.create(callData);
    return this.callsRepository.save(call);
  }

  async findAll(options: CallsListOptions): Promise<CallsListResponse> {
    const where: any = { isHidden: false };
    if (options.chain) {
      where.chain = options.chain;
    }

    const [data, total] = await this.callsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: ['creator'],
      take: options.limit,
      skip: options.offset,
    });

    return { data, meta: { total, limit: options.limit, offset: options.offset } };
  }

  async findOne(id: number): Promise<CallResponse> {
    const call = await this.callsRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!call) throw new NotFoundException('Call not found');
    return { data: call, meta: null };
  }

  async report(
    id: number,
    reason: string,
    reporterWallet: string,
  ): Promise<{ success: boolean; message: string }> {
    const call = await this.callsRepository.findOne({ where: { id } });
    if (!call) throw new NotFoundException('Call not found');

    call.reportCount += 1;
    call.lastReporterWallet = reporterWallet;
    if (call.reportCount >= 5) call.isHidden = true;

    await this.callsRepository.save(call);
    return { success: true, message: 'Report submitted successfully' };
  }

  async uploadIpfs(data: any): Promise<{ cid: string }> {
    const buffer = Buffer.from(JSON.stringify(data));
    const cid = await this.ipfsService.pin(buffer, 'data.json');
    return { cid };
  }

  async getIpfs(cid: string): Promise<any> {
    const buffer = await this.ipfsService.fetch(cid);
    return JSON.parse(buffer.toString('utf-8'));
  }

  async getStakesByWallet(wallet: string): Promise<any[]> {
    const participants = await this.participantsRepository.find({
      where: { wallet },
      relations: ['call'],
    });

    const now = new Date();

    return participants.map((participant) => {
      const call = participant.call as Call;
      const isSettled = call.status === 'SETTLED' || call.outcome !== null;
      const hasEnded = new Date(call.endTs) <= now;

      let status: 'active' | 'settled' | 'claimable' = 'active';
      if (isSettled) {
        status = participant.position === call.outcome ? 'claimable' : 'settled';
      } else if (hasEnded) {
        status = 'settled';
      }

      const timeLeft = hasEnded ? 'Ended' : getTimeRemaining(call.endTs);
      const callTitle = call.conditionJson?.title || `Market #${call.id}`;

      let payout: number | undefined;
      if (status === 'claimable') {
        const totalStakeYes = call.totalStakeYes || 0;
        const totalStakeNo = call.totalStakeNo || 0;
        const totalPool = totalStakeYes + totalStakeNo;
        const userStake = participant.amount;
        if (totalPool > 0) {
          const userSidePool = participant.position ? totalStakeYes : totalStakeNo;
          const losingPool = participant.position ? totalStakeNo : totalStakeYes;
          payout = userStake + losingPool * (userStake / userSidePool);
        } else {
          payout = userStake;
        }
      }

      return {
        id: participant.id,
        callId: call.id,
        callTitle,
        choice: participant.position ? 'yes' : 'no',
        amount: participant.amount,
        chain: call.chain,
        timeLeft: status === 'active' ? timeLeft : undefined,
        status,
        payout,
        result: status === 'claimable' ? 'won' : status === 'settled' ? 'lost' : undefined,
      };
    });
  }

  // ── Issue #300: Call lifecycle state machine ───────────────────────────────

  /**
   * Idempotent status transition with guard on endTs and lifecycle rules.
   * Valid transitions: OPEN → SETTLING → RESOLVED | UNRESOLVED.
   * Admin-only force path: UNRESOLVED | STALE → SETTLING.
   */
  async updateStatus(
    id: number,
    next: CallStatus,
    opts: { outcome?: boolean; adminForce?: boolean } = {},
  ): Promise<Call> {
    const call = await this.callsRepository.findOne({ where: { id } });
    if (!call) throw new NotFoundException('Call not found');

    // Idempotent — already in target state
    if (call.status === next) return call;

    if (!opts.adminForce) {
      assertTransition(call.status as CallStatus, next);

      // Cannot enter SETTLING before endTs
      if (next === 'SETTLING' && new Date(call.endTs) > new Date()) {
        throw new BadRequestException('Call endTs has not passed yet');
      }
    }

    call.status = next;
    if (next === 'RESOLVED' && opts.outcome !== undefined) {
      call.outcome = opts.outcome;
    }

    const saved = await this.callsRepository.save(call);

    // Emit outcome.proposed when transitioning to SETTLING
    if (next === 'SETTLING') {
      this.eventEmitter.emit('outcome.proposed', {
        marketId: String(call.callOnchainId ?? call.id),
        callId: String(call.id),
        submitter: 'system',
        resultCode: 0,
        windowExpiresAt: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
    }

    return saved;
  }

  // ── Issue #301: Participant accounting & pull-payout engine ───────────────

  /**
   * Calculate proportional payouts for all participants of a settled call.
   * Formula: payout = stake + (stake / winnerPool) * loserPool * (1 - feeBps/10000)
   * Draw / UNRESOLVED → all participants receive their stake back.
   */
  async calculatePayouts(
    callId: number,
    feeBps = DEFAULT_FEE_BPS,
  ): Promise<PayoutsResult> {
    const call = await this.callsRepository.findOne({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');

    const participants = await this.participantsRepository.find({
      where: { callId: String(callId) },
    });

    const totalPool = participants.reduce((s, p) => s + Number(p.amount), 0);
    const feeAmount = (totalPool * feeBps) / 10000;
    const netPool = totalPool - feeAmount;

    // Draw or unresolved → refund everyone
    if (call.outcome === null || call.outcome === undefined || call.status === 'UNRESOLVED') {
      return {
        callId,
        outcome: call.outcome ?? null,
        totalPool,
        feeBps,
        netPool: totalPool, // no fee on refunds
        payouts: participants.map((p) => ({
          participantId: p.id,
          wallet: p.wallet,
          stake: Number(p.amount),
          position: p.position,
          payout: Number(p.amount),
          isWinner: false,
        })),
      };
    }

    const winningSide = call.outcome;
    const winners = participants.filter((p) => p.position === winningSide);
    const losers = participants.filter((p) => p.position !== winningSide);
    const winnerPool = winners.reduce((s, p) => s + Number(p.amount), 0);
    const loserPool = losers.reduce((s, p) => s + Number(p.amount), 0);
    const netLoserPool = loserPool * (1 - feeBps / 10000);

    const payouts: ParticipantPayout[] = [
      ...winners.map((p) => {
        const stake = Number(p.amount);
        const share = winnerPool > 0 ? (stake / winnerPool) * netLoserPool : 0;
        return {
          participantId: p.id,
          wallet: p.wallet,
          stake,
          position: p.position,
          payout: stake + share,
          isWinner: true,
        };
      }),
      ...losers.map((p) => ({
        participantId: p.id,
        wallet: p.wallet,
        stake: Number(p.amount),
        position: p.position,
        payout: 0,
        isWinner: false,
      })),
    ];

    return { callId, outcome: call.outcome, totalPool, feeBps, netPool, payouts };
  }

  // ── Issue #302: Dispute workflow ──────────────────────────────────────────

  /** Raise a dispute for a call that is currently in SETTLING status. */
  async raiseDispute(
    callId: number,
    raiserWallet: string,
    bondAmount: number,
  ): Promise<Dispute> {
    const call = await this.callsRepository.findOne({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.status !== 'SETTLING') {
      throw new BadRequestException('Disputes can only be raised during SETTLING status');
    }

    const dispute = this.disputesRepository.create({
      callId,
      raiserWallet,
      bondAmount,
      status: 'OPEN',
    });
    const saved = await this.disputesRepository.save(dispute);

    this.eventEmitter.emit('dispute.raised', {
      marketId: String(call.callOnchainId ?? call.id),
      callId: String(callId),
      staker: raiserWallet,
      bondAmount: String(bondAmount),
      disputedAt: Date.now(),
    });

    return saved;
  }

  /** Admin: resolve an open dispute. */
  async resolveDispute(
    disputeId: string,
    adminWallet: string,
    upheld: boolean,
  ): Promise<Dispute> {
    const dispute = await this.disputesRepository.findOne({
      where: { id: disputeId },
      relations: ['call'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'OPEN') {
      throw new BadRequestException('Dispute is already resolved');
    }

    dispute.status = 'RESOLVED';
    dispute.resolvedBy = adminWallet;
    dispute.upheld = upheld;
    const saved = await this.disputesRepository.save(dispute);

    const call = dispute.call as Call;
    this.eventEmitter.emit('dispute.resolved', {
      marketId: String(call?.callOnchainId ?? dispute.callId),
      callId: String(dispute.callId),
      staker: dispute.raiserWallet,
      resolution: upheld ? 'upheld' : 'rejected',
      finalOutcomeCode: 0,
      resolvedAt: Date.now(),
    });

    return saved;
  }

  async findDisputesByCall(callId: number): Promise<Dispute[]> {
    return this.disputesRepository.find({ where: { callId } });
  }
}

function getTimeRemaining(endTs: string | Date): string {
  try {
    const now = new Date();
    const end = new Date(endTs);
    const diff = Math.max(0, end.getTime() - now.getTime());
    if (diff === 0) return 'Ended';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  } catch {
    return 'TBD';
  }
}
