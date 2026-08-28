export enum BadgeKey {
  FIRST_CALL = 'FIRST_CALL',
  FIVE_WINS = 'FIVE_WINS',
  TEN_WINS = 'TEN_WINS',
  WHALE_STAKER = 'WHALE_STAKER',
  SOCIAL_BUTTERFLY = 'SOCIAL_BUTTERFLY',
  STREAK = 'STREAK',
  HIGH_ROLLER = 'HIGH_ROLLER',
  ORACLE_SLAYER = 'ORACLE_SLAYER',
}

export interface BadgeDefinition {
  key: BadgeKey;
  name: string;
  description: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: BadgeKey.FIRST_CALL,
    name: 'First Call',
    description: 'Created your first prediction call',
  },
  {
    key: BadgeKey.FIVE_WINS,
    name: 'Rising Star',
    description: 'Won 5 prediction calls',
  },
  {
    key: BadgeKey.TEN_WINS,
    name: 'Market Maven',
    description: 'Won 10 prediction calls',
  },
  {
    key: BadgeKey.WHALE_STAKER,
    name: 'Whale Staker',
    description: 'Your markets attracted over 1,000 tokens in total stake',
  },
  {
    key: BadgeKey.SOCIAL_BUTTERFLY,
    name: 'Social Butterfly',
    description: 'Gained 10 followers',
  },
  {
    key: BadgeKey.STREAK,
    name: 'On A Roll',
    description: 'Won 3 prediction calls in a row',
  },
  {
    key: BadgeKey.HIGH_ROLLER,
    name: 'High Roller',
    description: 'Markets attracted over 10,000 tokens in total stake',
  },
  {
    key: BadgeKey.ORACLE_SLAYER,
    name: 'Oracle Slayer',
    description: 'Beat the oracle on 3 underdog outcomes',
  },
];
