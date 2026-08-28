import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import {
  PriceHistoryPeriod,
  PriceHistoryQueryDto,
} from './dto/price-history-query.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /analytics/price-history?tokenAddress=<address>&period=7d|30d
   *
   * Returns hourly OHLCV close prices formatted as [timestamp_ms, price] tuples,
   * sorted ascending. Results are cached in Redis for 10 minutes.
   */
  @Get('price-history')
  getPriceHistory(@Query() query: PriceHistoryQueryDto) {
    const period = query.period ?? PriceHistoryPeriod.SEVEN_DAYS;
    return this.analyticsService.getPriceHistory(query.tokenAddress, period);
  }

  /**
   * GET /analytics/reputation/:wallet
   *
   * Returns a wallet's computed reputation score. Cached for 1 hour.
   */
  @Get('reputation/:wallet')
  getReputation(@Param('wallet') wallet: string) {
    return this.analyticsService.getReputation(wallet);
  }
}
