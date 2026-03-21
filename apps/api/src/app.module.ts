import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { RateLimitModule } from './rate-limit/rate-limit.module'

@Module({
  imports: [PrismaModule, AuthModule, RateLimitModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
