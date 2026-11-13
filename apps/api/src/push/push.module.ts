import { Module, forwardRef } from '@nestjs/common'
import { PushController } from './push.controller'
import { PushService } from './push.service'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { NotificationsService } from '../notifications/notifications.service'
import { InboxModule } from '../inbox/inbox.module'

@Module({
  imports: [PrismaModule, InboxModule, forwardRef(() => NotificationsModule)],
  controllers: [PushController],
  providers: [
    PushService,
    {
      provide: 'NotificationsService',
      useExisting: NotificationsService,
    },
  ],
  exports: [PushService],
})
export class PushModule {}
