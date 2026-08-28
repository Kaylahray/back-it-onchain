import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * AuditLog – append-only record of every oracle sign, relayer submit, and
 * admin action. No UPDATE or DELETE operations are permitted on this table;
 * enforcement is handled at the service layer (AuditLogService).
 */
@Entity('audit_logs')
@Index('IDX_audit_callId', ['callId'])
@Index('IDX_audit_actor', ['actor'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Numeric call identifier this log entry relates to (nullable for admin actions). */
  @Column({ nullable: true })
  callId: string;

  /** Action type: e.g. "oracle.sign", "relayer.submit", "admin.pause". */
  @Column()
  action: string;

  /** Wallet address or service identifier that triggered the action. */
  @Column()
  actor: string;

  /** SHA-256 hex hash of the signed / submitted payload for tamper detection. */
  @Column({ nullable: true })
  payloadHash: string;

  /** IPFS CID of supporting evidence attached to this action (optional). */
  @Column({ nullable: true })
  evidenceCid: string;

  // ── Legacy fields kept for backward compatibility with indexer.service.ts ──

  @Column({ nullable: true })
  targetResource: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
