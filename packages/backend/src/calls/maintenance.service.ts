import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Call } from './call.entity';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callsRepository: Repository<Call>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Every 6 hours: move expired OPEN calls to SETTLING and emit outcome.proposed. */
  @Cron('0 */6 * * *')
  async handleStaleCallsCleanup(): Promise<void> {
    this.logger.log('Running stale call detection...');

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const staleCalls = await this.callsRepository.find({
      where: { status: 'OPEN', endTs: LessThan(cutoff), isHidden: false },
    });

    if (staleCalls.length === 0) {
      this.logger.log('No stale calls found.');
      return;
    }

    for (const call of staleCalls) {
      call.status = 'SETTLING';
      await this.callsRepository.save(call);
      this.logger.warn(`Call ${call.id} transitioned OPEN → SETTLING by maintenance job.`);

      this.eventEmitter.emit('outcome.proposed', {
        marketId: String(call.callOnchainId ?? call.id),
        callId: String(call.id),
        submitter: 'maintenance',
        resultCode: 0,
        windowExpiresAt: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
    }

    this.logger.log(`Transitioned ${staleCalls.length} call(s) to SETTLING.`);
  }
}
