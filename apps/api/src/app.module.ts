import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { RateLimitModule } from './rate-limit/rate-limit.module'
import { ClubsModule } from './clubs/clubs.module'
import { EventsModule } from './events/events.module'

@Module({
  imports: [PrismaModule, AuthModule, RateLimitModule, ClubsModule, EventsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
