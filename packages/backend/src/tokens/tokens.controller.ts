import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TokensService } from './tokens.service';
import { TokenSearchQueryDto } from './dto/token-search.dto';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  /**
   * GET /tokens/search?q=<query>
   *
   * Proxies token discovery to DexScreener (primary) with a GeckoTerminal
   * fallback, normalizes results, and attaches a heuristic safety score.
   * Cached 5 minutes per query; rate-limited since it fans out to two
   * external APIs per cache miss.
   */
  @Get('search')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  search(@Query() query: TokenSearchQueryDto) {
    return this.tokensService.search(query.q);
  }
}
