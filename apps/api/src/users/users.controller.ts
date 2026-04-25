import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  MembershipRole,
  completeOnboardingSchema,
  offboardClubMemberSchema,
  updateOperationalRolesSchema,
  updateMembershipRoleSchema,
} from '@anstoss/shared'
import { UsersService } from './users.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { R2Provider } from '../assets/r2.provider'

@Controller()
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly r2: R2Provider,
  ) {}

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
   * POST /me/onboarding — role-dispatched onboarding completion.
   */
  @Post('me/onboarding')
  @RateLimit('write')
  async completeOnboarding(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = completeOnboardingSchema.parse(body)
    return this.usersService.completeOnboarding(user.id, data)
  }

  /**
   * POST /me/avatar/presign — get a presigned URL for avatar upload.
   */
  @Post('me/avatar/presign')
  @RateLimit('write')
  async presignAvatar(
    @CurrentUser() user: { id: string },
    @Body() body: { filename: string; contentType: string },
  ) {
    const safeFilename = (body.filename || 'avatar.png').replace(/[^a-zA-Z0-9._-]/g, '-')
    const objectKey = `users/${user.id}/avatar/${Date.now()}-${safeFilename}`
    const contentType = body.contentType || 'image/png'

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }

    const { uploadUrl, publicUrl } = await this.r2.presignPut(objectKey, contentType)
    return { enabled: true, objectKey, uploadUrl, publicUrl }
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
   * PATCH /clubs/:clubId/members/:userId/role — update a club member role.
   */
  @Patch('clubs/:clubId/members/:userId/role')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async updateMemberRole(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('userId') memberUserId: string,
    @Body() body: unknown,
  ) {
    const data = updateMembershipRoleSchema.parse(body)
    return this.usersService.updateClubMemberRole(
      clubId,
      user.id,
      memberUserId,
      data.role,
    )
  }

  @Patch('clubs/:clubId/members/:userId/operational-roles')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async updateMemberOperationalRoles(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('userId') memberUserId: string,
    @Body() body: unknown,
  ) {
    const data = updateOperationalRolesSchema.parse(body)
    return this.usersService.updateOperationalRoles(
      clubId,
      user.id,
      memberUserId,
      data.operationalRoles,
    )
  }

  @Post('clubs/:clubId/members/:userId/offboard')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async offboardMember(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('userId') memberUserId: string,
    @Body() body: unknown,
  ) {
    const data = offboardClubMemberSchema.parse(body)
    return this.usersService.offboardClubMember(
      clubId,
      user.id,
      memberUserId,
      data,
    )
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

  /**
   * GET /me/export — GDPR data export.
   */
  @Get('me/export')
  async exportMyData(@CurrentUser() user: { id: string }) {
    return this.usersService.exportUserData(user.id)
  }

  /**
   * DELETE /me — GDPR account deletion (soft delete + anonymization).
   */
  @Delete('me')
  @RateLimit('write')
  async deleteMyAccount(@CurrentUser() user: { id: string }) {
    return this.usersService.deleteAccount(user.id)
  }

  /**
   * GET /me/children-events — cross-team events for a parent's children.
   */
  @Get('me/children-events')
  async getChildrenEvents(
    @CurrentUser() user: { id: string },
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.usersService.getChildrenEvents(user.id, { dateFrom, dateTo })
  }
}
