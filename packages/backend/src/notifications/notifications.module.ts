import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationEventsService } from './notification-events.service';
import { NotificationListeners } from './notification.listeners';
import { NotificationsCleanupService } from './notifications-cleanup.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), AuthModule],
  providers: [
    NotificationsService,
    NotificationEventsService,
    NotificationListeners,
    NotificationsCleanupService,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationEventsService],
})
export class NotificationsModule {}
