import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSettings } from '../indexer/platform-settings.entity';
import { AuditLog } from '../oracle/audit-log.entity';
import { AuditLogService } from '../oracle/audit-log.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PaymasterPolicyService } from '../oracle/paymaster-policy.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformSettings, AuditLog]),
  ],
  controllers: [AdminController],
  providers: [AdminService, PaymasterPolicyService, AuditLogService],
  exports: [AdminService, PaymasterPolicyService, AuditLogService],
})
export class AdminModule {}
