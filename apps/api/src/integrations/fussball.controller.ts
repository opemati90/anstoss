import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  createExternalTeamLinkSchema,
  fussballTeamPreviewRequestSchema,
  saveFixtureLineupSchema,
  teamFixturesQuerySchema,
  updateFixtureLocksSchema,
  updateFixtureOverlaySchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { FussballService } from './fussball.service'

@Controller()
@UseGuards(ClerkAuthGuard)
export class FussballController {
  constructor(private readonly fussballService: FussballService) {}

  @Post('integrations/fussball/team-preview')
  async previewTeamLink(@Body() body: unknown) {
    const input = fussballTeamPreviewRequestSchema.parse(body)
    return this.fussballService.previewTeamLink(input.input)
  }

  @Get('integrations/fussball/team-links')
  async listTeamLinks(
    @CurrentUser() user: { id: string },
    @Query('teamId') teamId: string,
  ) {
    return this.fussballService.listTeamLinks(user.id, teamId)
  }

  @Post('integrations/fussball/team-links')
  async createTeamLink(
    @CurrentUser() user: { id: string },
    @Headers('x-club-id') clubId: string | undefined,
    @Body() body: unknown,
  ) {
    const input = createExternalTeamLinkSchema.parse(body)
    return this.fussballService.createTeamLink(user.id, clubId, input)
  }

  @Get('fixtures/:fixtureId/lineup')
  async getFixtureLineup(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.fussballService.getFixtureLineup(user.id, fixtureId)
  }

  @Get('fixtures/:fixtureId/timeline')
  async getFixtureTimeline(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.fussballService.getFixtureTimeline(user.id, fixtureId)
  }

  @Get('fixtures/:fixtureId/facts')
  async getFixtureFacts(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.fussballService.getFixtureFacts(user.id, fixtureId)
  }

  @Put('fixtures/:fixtureId/lineup')
  async saveFixtureLineup(
    @CurrentUser() user: { id: string },
    @Headers('x-club-id') clubId: string | undefined,
    @Param('fixtureId') fixtureId: string,
    @Body() body: unknown,
  ) {
    const input = saveFixtureLineupSchema.parse(body)
    return this.fussballService.saveFixtureLineup(
      user.id,
      clubId,
      fixtureId,
      input,
    )
  }

  @Get('teams/:teamId/fixtures')
  async listFixtures(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Query() query: unknown,
  ) {
    const input = teamFixturesQuerySchema.parse(query)
    return this.fussballService.listFixtures(user.id, teamId, input)
  }

  @Patch('fixtures/:fixtureId/overlay')
  async updateFixtureOverlay(
    @CurrentUser() user: { id: string },
    @Headers('x-club-id') clubId: string | undefined,
    @Param('fixtureId') fixtureId: string,
    @Body() body: unknown,
  ) {
    const input = updateFixtureOverlaySchema.parse(body)
    return this.fussballService.updateFixtureOverlay(
      user.id,
      clubId,
      fixtureId,
      input,
    )
  }

  @Patch('fixtures/:fixtureId/locks')
  async updateFixtureLocks(
    @CurrentUser() user: { id: string },
    @Headers('x-club-id') clubId: string | undefined,
    @Param('fixtureId') fixtureId: string,
    @Body() body: unknown,
  ) {
    const input = updateFixtureLocksSchema.parse(body)
    return this.fussballService.updateFixtureLocks(
      user.id,
      clubId,
      fixtureId,
      input,
    )
  }
}
