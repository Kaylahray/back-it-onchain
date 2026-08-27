import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Call } from './call.entity';

export type DisputeStatus = 'OPEN' | 'RESOLVED';

@Entity('disputes')
@Index('IDX_dispute_call_id', ['callId'])
@Index('IDX_dispute_raiser', ['raiserWallet'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  callId: number;

  @ManyToOne(() => Call)
  @JoinColumn({ name: 'callId' })
  call: Call;

  /** Wallet address of the party raising the dispute. */
  @Column()
  raiserWallet: string;

  /** Bond amount staked alongside the dispute. */
  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  bondAmount: number;

  @Column({ default: 'OPEN' })
  status: DisputeStatus;

  /** Admin wallet that resolved this dispute (if resolved). */
  @Column({ nullable: true })
  resolvedBy: string;

  /** Resolution verdict — true = dispute upheld, false = rejected. */
  @Column({ nullable: true })
  upheld: boolean;

  @CreateDateColumn()
  raisedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
