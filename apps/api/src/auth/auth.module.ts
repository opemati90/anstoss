import { Module } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk.guard'
import { RolesGuard } from './roles.guard'

@Module({
  providers: [ClerkAuthGuard, RolesGuard],
  exports: [ClerkAuthGuard, RolesGuard],
})
export class AuthModule {}
