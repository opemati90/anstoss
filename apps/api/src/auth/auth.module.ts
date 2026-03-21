import { Module } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk.guard'
import { RolesGuard } from './roles.guard'
import { AgeGateGuard } from './age-gate.guard'

@Module({
  providers: [ClerkAuthGuard, RolesGuard, AgeGateGuard],
  exports: [ClerkAuthGuard, RolesGuard, AgeGateGuard],
})
export class AuthModule {}
