import { Controller, Get, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { JoinRequestsService } from './join-requests.service'

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
  constructor(private readonly joinRequests: JoinRequestsService) {}

  @Get('me/join-requests/active')
  async getMyActiveJoinRequest(@CurrentUser() user: { id: string }) {
    const request = await this.joinRequests.findMyActive(user.id)
    if (!request) return { request: null }
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
