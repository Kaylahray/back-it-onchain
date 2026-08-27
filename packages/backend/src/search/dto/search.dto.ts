import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  MaxLength,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const CHAINS = ['base', 'stellar'];
const STATUSES = ['OPEN', 'RESOLVED'];

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  q: string;

  @IsOptional()
  @IsIn(CHAINS)
  chain?: 'base' | 'stellar';

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class UserSearchResult {
  id: string;
  displayName: string;
  address: string;
  avatar?: string;
}

export class CallSearchResult {
  id: string;
  title: string;
  description: string;
  chain: string;
  status: string;
  createdAt: Date;
}

export class TokenSearchResult {
  id: string;
  name: string;
  symbol: string;
  address: string;
}

export class SearchResponseDto {
  users: UserSearchResult[];
  calls: CallSearchResult[];
  tokens: TokenSearchResult[];
  meta: {
    query: string;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
