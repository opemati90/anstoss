import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
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
import { LoggingModule } from './logging/logging.module'
import { VersionModule } from './version/version.module'
import { HealthModule } from './health/health.module'
import { AdminModule } from './admin/admin.module'
import { PublicModule } from './public/public.module'
import { AssetsModule } from './assets/assets.module'
import { BillingModule } from './billing/billing.module'
import { ContributionsModule } from './contributions/contributions.module'
import { AuditModule } from './audit/audit.module'
import { TeamsModule } from './teams/teams.module'
import { IntegrationsModule } from './integrations/integrations.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ConsentModule } from './consent/consent.module'
import { MarketplaceModule } from './marketplace/marketplace.module'
import { ScoutingModule } from './scouting/scouting.module'
import { StreaksModule } from './streaks/streaks.module'
import { DmModule } from './dm/dm.module'
import { ChannelsModule } from './channels/channels.module'
import { OnboardingModule } from './onboarding/onboarding.module'
import { TranslationModule } from './translation/translation.module'
import { LiveModule } from './live/live.module'
import { MotmModule } from './motm/motm.module'
import { MediaModule } from './media/media.module'
import { CacheModule } from './cache/cache.module'
import { ModerationModule } from './moderation/moderation.module'
import { SponsorsModule } from './sponsors/sponsors.module'
import { I18nModule, I18nMiddleware } from './i18n'

@Module({
  imports: [
    I18nModule,
    LoggingModule,
    PrismaModule,
    CacheModule,
    AuthModule,
    RateLimitModule,
    VersionModule,
    HealthModule,
    ClubsModule,
    EventsModule,
    InvitesModule,
    UsersModule,
    ChatModule,
    MessagesModule,
    PushModule,
    AdminModule,
    PublicModule,
    AssetsModule,
    BillingModule,
    ContributionsModule,
    AuditModule,
    TeamsModule,
    IntegrationsModule,
    NotificationsModule,
    ConsentModule,
    MarketplaceModule,
    ScoutingModule,
    StreaksModule,
    DmModule,
    ChannelsModule,
    OnboardingModule,
    TranslationModule,
    LiveModule,
    MotmModule,
    MediaModule,
    ModerationModule,
    SponsorsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(I18nMiddleware).forRoutes('*')
  }
}
