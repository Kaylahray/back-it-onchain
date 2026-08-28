import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class TokenSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  q: string;
}

export interface TokenSearchResultDto {
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  dexId: string;
  priceUsd: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  pairCreatedAt: number | null;
  /** Heuristic 0-100 score — higher is safer. See TokensService.computeSafetyScore. */
  safetyScore: number;
  url: string;
}
