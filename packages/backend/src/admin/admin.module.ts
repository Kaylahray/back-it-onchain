import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSettings } from '../indexer/platform-settings.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PaymasterPolicyService } from '../oracle/paymaster-policy.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PlatformSettings])],
  controllers: [AdminController],
  providers: [AdminService, PaymasterPolicyService],
  exports: [AdminService, PaymasterPolicyService],
})
export class AdminModule {}
