import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ClerkAuthGuard } from './clerk.guard'
import { RolesGuard } from './roles.guard'
import { AgeGateGuard } from './age-gate.guard'
import { AgeGateService } from './age-gate.service'
import { OtpController } from './otp/otp.controller'
import { OtpService } from './otp/otp.service'

@Global()
@Module({
  controllers: [OtpController],
  providers: [
    ClerkAuthGuard,
    RolesGuard,
    AgeGateService,
    AgeGateGuard,
    // Privacy/safeguarding: the age gate runs on EVERY authenticated route.
    // Routes a gated child must still reach opt out with @AllowWithoutConsent().
    { provide: APP_GUARD, useExisting: AgeGateGuard },
    OtpService,
  ],
  exports: [ClerkAuthGuard, RolesGuard, AgeGateGuard, AgeGateService, OtpService],
})
export class AuthModule {}
