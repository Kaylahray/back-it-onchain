import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

export enum LeaderboardPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALL_TIME = 'all_time',
}

@Entity('leaderboards')
export class Leaderboard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: LeaderboardPeriod })
  @Index()
  period: LeaderboardPeriod;

  @Column()
  rank: number;

  @Column()
  userId: string;

  @Column({ type: 'float', default: 0 })
  winRate: number;

  @Column({ type: 'float', default: 0 })
  profit: number;

  @Column({ type: 'float', default: 0 })
  stakeVolume: number;

  @Column({ type: 'float', default: 0 })
  reputationScore: number;

  @Column({ default: 0 })
  totalPredictions: number;
}
