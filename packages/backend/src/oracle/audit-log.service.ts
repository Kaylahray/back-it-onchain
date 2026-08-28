import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AppendAuditParams {
  callId?: string;
  action: string;
  actor: string;
  payloadHash?: string;
  evidenceCid?: string;
}

/**
 * AuditLogService
 *
 * Provides a single append-only write path for audit entries.
 * No update or delete methods are exposed intentionally.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** Append a new immutable audit entry. */
  async append(params: AppendAuditParams): Promise<AuditLog> {
    const entry = this.repo.create(params);
    return this.repo.save(entry);
  }

  /** Query audit logs by optional callId filter (used by GET /admin/audit). */
  async query(callId?: string): Promise<AuditLog[]> {
    if (callId) {
      return this.repo.find({
        where: { callId },
        order: { createdAt: 'DESC' },
      });
    }
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }
}
