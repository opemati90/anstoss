import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { RateLimitModule } from './rate-limit/rate-limit.module'
import { ClubsModule } from './clubs/clubs.module'

@Module({
  imports: [PrismaModule, AuthModule, RateLimitModule, ClubsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
