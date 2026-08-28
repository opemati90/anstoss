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
  syncTeamLinkSchema,
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

  @Post('integrations/fussball/team-links/:teamLinkId/sync')
  async syncTeamLink(
    @CurrentUser() user: { id: string },
    @Headers('x-club-id') clubId: string | undefined,
    @Param('teamLinkId') teamLinkId: string,
    @Body() body: unknown,
  ) {
    const input = syncTeamLinkSchema.parse(body || {})
    return this.fussballService.syncTeamLink(
      user.id,
      clubId,
      teamLinkId,
      input.force,
    )
  }

  @Get('integrations/fussball/team-links/:teamLinkId/roster')
  async getRoster(
    @CurrentUser() user: { id: string },
    @Param('teamLinkId') teamLinkId: string,
  ) {
    return this.fussballService.fetchRosterFromTeamLink(user.id, teamLinkId)
  }

  /**
   * Licensed-feed club search. Production returns an unavailable/empty
   * result unless the explicit licensed-feed feature flag and credentials
   * are configured. Public FUSSBALL.DE pages are never scraped here.
   */
  @Get('integrations/fussball/search')
  async searchClubs(@Query('q') query: string) {
    return this.fussballService.searchFussballClubs(query ?? '')
  }

  /** List teams supplied by the explicitly enabled licensed feed. */
  @Get('integrations/fussball/clubs/:externalClubId/teams')
  async getClubTeams(@Param('externalClubId') externalClubId: string) {
    return this.fussballService.fetchClubTeamsFromScraper(externalClubId)
  }

  /** Optional licensed-feed enrichment for an authorized fixture reader. */
  @Get('integrations/fussball/match/:externalMatchId/enrichment')
  async getMatchEnrichment(
    @CurrentUser() user: { id: string },
    @Param('externalMatchId') externalMatchId: string,
  ) {
    return this.fussballService.fetchMatchEnrichmentForUser(
      user.id,
      externalMatchId,
    )
  }

  @Get('fixtures/:fixtureId/enrichment')
  async getFixtureEnrichment(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.fussballService.fetchMatchEnrichmentForFixture(
      user.id,
      fixtureId,
    )
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
