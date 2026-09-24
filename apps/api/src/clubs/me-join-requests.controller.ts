import { Controller, Get, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { JoinRequestsService } from './join-requests.service'
import { AllowWithoutConsent } from '../auth/age-gate.guard'
import { PrismaService } from '../prisma/prisma.service'
import { findLatestJoinDecision } from './join-request-decision'

/**
 * GET /me/join-requests/active — return the caller's pending join
 * request (if any). Lightweight poll target for /pending-approval so
 * the screen can flip to /done the moment a coach approves without
 * waiting on the next refreshUser() cycle.
 *
 * Lives in its own controller so it doesn't inherit the `/clubs/...`
 * prefix from JoinRequestsController.
 */
@Controller()
@UseGuards(ClerkAuthGuard)
export class MeJoinRequestsController {
  constructor(
    private readonly joinRequests: JoinRequestsService,
    // onboarding review fix (M2): report the last decision.
    private readonly prisma: PrismaService,
  ) {}

  @AllowWithoutConsent()
  @Get('me/join-requests/active')
  async getMyActiveJoinRequest(@CurrentUser() user: { id: string }) {
    const request = await this.joinRequests.findMyActive(user.id)
    // M2: nothing pending any more: say what the club decided (approved, or
    // declined with its reason) so the app never guesses.
    if (!request) {
      return { request: null, lastDecision: await findLatestJoinDecision(this.prisma, user.id) }
    }
    return {
      request: {
        id: request.id,
        clubId: request.clubId,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        club: request.club,
      },
    }
  }
}
