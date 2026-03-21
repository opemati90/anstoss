import { Module } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk.guard'

@Module({
  providers: [ClerkAuthGuard],
  exports: [ClerkAuthGuard],
})
export class AuthModule {}
