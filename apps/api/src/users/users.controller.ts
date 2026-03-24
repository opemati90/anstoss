import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'

@Controller()
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /me — current user's profile + memberships.
   */
  @Get('me')
  async getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.getMe(user.id)
  }

  /**
   * PATCH /me — update profile (name, avatar).
   */
  @Patch('me')
  @RateLimit('write')
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: { name?: string; avatarUrl?: string; dateOfBirth?: string },
  ) {
    return this.usersService.updateProfile(user.id, body)
  }

  /**
   * GET /clubs/:clubId/members — list club members.
   */
  @Get('clubs/:clubId/members')
  async listMembers(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.usersService.listClubMembers(clubId, user.id, teamId)
  }

  /**
   * GET /clubs/:clubId/members/:userId — member profile in club context.
   */
  @Get('clubs/:clubId/members/:userId')
  async getMemberProfile(
    @Param('userId') userId: string,
    @Param('clubId') clubId: string,
  ) {
    return this.usersService.getClubProfile(userId, clubId)
  }
}
