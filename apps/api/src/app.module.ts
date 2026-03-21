import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { RateLimitModule } from './rate-limit/rate-limit.module'
import { ClubsModule } from './clubs/clubs.module'
import { EventsModule } from './events/events.module'
import { InvitesModule } from './invites/invites.module'
import { UsersModule } from './users/users.module'
import { ChatModule } from './chat/chat.module'
import { MessagesModule } from './messages/messages.module'
import { PushModule } from './push/push.module'

@Module({
  imports: [PrismaModule, AuthModule, RateLimitModule, ClubsModule, EventsModule, InvitesModule, UsersModule, ChatModule, MessagesModule, PushModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
