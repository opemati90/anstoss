import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
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
  @UseGuards(AgeGateGuard)
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

  @Post('join-team')
  @UseGuards(AgeGateGuard)
  async joinTeam(
    @CurrentUser() user: { id: string },
    @Body() body: { joinCode?: string; role?: string },
  ) {
    const role = body.role
    // PARENT onboarding is cut from MVP (guardian/child linking isn't
    // built). Only PLAYER and COACH may join via a team code.
    if (role !== 'PLAYER' && role !== 'COACH') {
      throw new BadRequestException('Unsupported role for team-code join')
    }
    if (!body.joinCode || typeof body.joinCode !== 'string') {
      throw new BadRequestException('joinCode is required')
    }
    const result = await this.onboarding.joinTeamByCode(user.id, {
      joinCode: body.joinCode,
      role,
    })
    return { ok: true, ...result }
  }
}
