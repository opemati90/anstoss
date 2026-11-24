import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { AI_TRANSLATION_NOTICE_VERSION, aiTranslationConsentSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { TranslationService } from './translation.service'

@Controller('me/ai-translation')
@UseGuards(ClerkAuthGuard)
export class TranslationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translation: TranslationService,
  ) {}

  @Get()
  async getPreference(@CurrentUser() user: { id: string }) {
    return {
      enabled: await this.translation.hasAiConsent(user.id),
      available: this.translation.isAiAvailable(),
      noticeVersion: AI_TRANSLATION_NOTICE_VERSION,
    }
  }

  @Put()
  @RateLimit('write')
  async setPreference(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const data = aiTranslationConsentSchema.parse(body)
    // Idempotent enable preserves the cutoff; re-enabling after revocation
    // starts a new cutoff. No client-controlled timestamps or account IDs.
    // Use the database clock, as message.createdAt does. Host clock skew must
    // never make pre-consent messages eligible. Parameters remain bound.
    await this.prisma.$executeRaw`
      UPDATE "User" SET "aiTranslationConsentAt" = CASE WHEN ${data.enabled}
        THEN COALESCE("aiTranslationConsentAt", clock_timestamp() AT TIME ZONE 'UTC')
        ELSE NULL END, "updatedAt" = clock_timestamp() AT TIME ZONE 'UTC'
      WHERE "id" = ${user.id} AND "deletedAt" IS NULL
    `
    return this.getPreference(user)
  }
}
