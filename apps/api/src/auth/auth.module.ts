import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ClerkAuthGuard } from './clerk.guard'
import { RolesGuard } from './roles.guard'
import { AgeGateGuard } from './age-gate.guard'
import { AgeGateService } from './age-gate.service'
import { OtpController } from './otp/otp.controller'
import { OtpService } from './otp/otp.service'
import { IdentityRetentionWorker } from './identity-retention.worker'
import { SocialLoginController } from './oauth/oauth.controller'
import { SocialLoginService } from './oauth/oauth.service'
import { OAuthProviderService } from './oauth/oauth.provider'
import { SocialIdentityRetentionWorker } from './oauth/oauth-retention.worker'
import { AppleNotificationController } from './oauth/apple-notification.controller'
import { AppleNotificationService } from './oauth/apple-notification.service'

@Global()
@Module({
  controllers: [OtpController, SocialLoginController, AppleNotificationController],
  providers: [
    ClerkAuthGuard,
    RolesGuard,
    AgeGateService,
    AgeGateGuard,
    // Privacy/safeguarding: the age gate runs on EVERY authenticated route.
    // Routes a gated child must still reach opt out with @AllowWithoutConsent().
    { provide: APP_GUARD, useExisting: AgeGateGuard },
    OtpService,
    IdentityRetentionWorker,
    SocialLoginService,
    OAuthProviderService,
    SocialIdentityRetentionWorker,
    AppleNotificationService,
  ],
  exports: [ClerkAuthGuard, RolesGuard, AgeGateGuard, AgeGateService, OtpService],
})
export class AuthModule {}
