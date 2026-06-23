import { Global, Module } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk.guard'
import { RolesGuard } from './roles.guard'
import { AgeGateGuard } from './age-gate.guard'
import { OtpController } from './otp/otp.controller'
import { OtpService } from './otp/otp.service'

@Global()
@Module({
  controllers: [OtpController],
  providers: [ClerkAuthGuard, RolesGuard, AgeGateGuard, OtpService],
  exports: [ClerkAuthGuard, RolesGuard, AgeGateGuard, OtpService],
})
export class AuthModule {}
