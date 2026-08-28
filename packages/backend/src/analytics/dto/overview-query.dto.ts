import { IsEnum, IsOptional } from 'class-validator';

export enum AnalyticsChainFilter {
  BASE = 'base',
  STELLAR = 'stellar',
}

export enum AnalyticsExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class OverviewQueryDto {
  @IsOptional()
  @IsEnum(AnalyticsChainFilter)
  chain?: AnalyticsChainFilter;

  @IsOptional()
  @IsEnum(AnalyticsExportFormat)
  format?: AnalyticsExportFormat;
}
