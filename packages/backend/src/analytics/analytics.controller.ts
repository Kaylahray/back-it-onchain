import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import {
  PriceHistoryPeriod,
  PriceHistoryQueryDto,
} from './dto/price-history-query.dto';
import {
  AnalyticsExportFormat,
  OverviewQueryDto,
} from './dto/overview-query.dto';

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

  /**
   * GET /analytics/overview?chain=base|stellar&format=json|csv
   *
   * Platform-wide metrics: total calls, total stake volume, active users
   * (24h/7d), and the win/loss/pending distribution. Cached 2 minutes.
   */
  @Get('overview')
  async getOverview(
    @Query() query: OverviewQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const overview = await this.analyticsService.getOverview(query.chain);

    if (query.format === AnalyticsExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="analytics-overview.csv"',
      );
      return this.analyticsService.overviewToCsv(overview);
    }

    return overview;
  }
}
