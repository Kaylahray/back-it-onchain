import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexerService } from './indexer.service';
import { IndexerController, IndexerWebhookController } from './indexer.controller';
import { Call } from '../calls/call.entity';
import { StakeActivity } from '../calls/stake-activity.entity';
import { PlatformSettings } from './platform-settings.entity';
import { AuditLog } from '../oracle/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([Call, StakeActivity, PlatformSettings, AuditLog]),
    NotificationsModule,
  ],
  providers: [IndexerService],
  controllers: [IndexerController, IndexerWebhookController],
})
export class IndexerModule {}
