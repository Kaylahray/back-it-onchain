import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { CacheHealthIndicator } from './indicators/cache.health-indicator';
import { RpcHealthIndicator } from './indicators/rpc.health-indicator';
import { RpcModule } from '../config/rpc.module';

@Module({
  imports: [TerminusModule, ConfigModule, RpcModule],
  controllers: [HealthController],
  providers: [CacheHealthIndicator, RpcHealthIndicator],
})
export class HealthModule {}
