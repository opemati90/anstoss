import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
@UseGuards(ClerkAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('pending-claims')
  async listPendingClaims(@CurrentUser() user: { id: string; clerkId: string | null }) {
    if (!user.clerkId) return []
    return this.onboarding.listPendingClaims(user.clerkId)
  }

  @Post('claim/:slotId')
  async claim(
    @CurrentUser() user: { id: string; clerkId: string | null },
    @Param('slotId') slotId: string,
  ) {
    if (!user.clerkId) {
      return { ok: false }
    }
    const result = await this.onboarding.claimSlot(user.id, user.clerkId, slotId)
    return { ok: true, ...result }
  }
}
