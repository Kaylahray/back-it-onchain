import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Well-known `action` values written by OracleService. Kept as a plain
 * string union (rather than a Postgres enum) so new actions never require
 * a migration — callers are free to log other actions too.
 */
export enum AuditLogAction {
  ORACLE_SETTLEMENT = 'oracle.settlement',
  ORACLE_UNRESOLVED = 'oracle.unresolved',
  ORACLE_KEY_ROTATED = 'oracle.key_rotated',
}

@Entity('audit_logs')
@Index('IDX_audit_log_action_created_at', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column()
  actor: string;

  @Column({ nullable: true })
  targetResource: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown>;

  /** IPFS CID of the pinned evidence JSON, when the action produced one. */
  @Column({ nullable: true })
  evidenceCid: string;

  /** Chain the action relates to ('base' | 'stellar'), when applicable. */
  @Column({ nullable: true })
  chain: string;

  @CreateDateColumn()
  createdAt: Date;
}
