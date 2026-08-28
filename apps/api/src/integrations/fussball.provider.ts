import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type {
  ApiFussballGame,
  ApiFussballTableRow,
  FussballPagePreview,
  FussballRoster,
} from './fussball.utils'

export interface ApiFussballTeamBundle {
  prevGames: ApiFussballGame[]
  nextGames: ApiFussballGame[]
  table: ApiFussballTableRow[]
}

export interface ApiFussballPlayer {
  number?: number | null
  name?: string | null
  position?: string | null
  isCaptain?: boolean
}

export interface ApiFussballLineupSide {
  formation: string | null
  starters: ApiFussballPlayer[]
  bench: ApiFussballPlayer[]
}

export interface ApiFussballLineupBundle {
  home: ApiFussballLineupSide
  away: ApiFussballLineupSide
}

/**
 * Historical provider interface retained so old records and callers fail
 * safely. Anstoss stores official DFB/FUSSBALL.DE/FuPa links as references and
 * never fetches, parses, scrapes, or imports the provider page.
 */
@Injectable()
export class FussballProviderService {
  async fetchTeamBundle(_externalTeamId: string): Promise<ApiFussballTeamBundle> {
    throw importsDisabledError()
  }

  async fetchMatchLineup(
    _externalMatchId: string,
  ): Promise<ApiFussballLineupBundle | null> {
    return null
  }

  async fetchTeamRoster(_input: string): Promise<FussballRoster> {
    throw importsDisabledError()
  }

  async fetchTeamPage(
    _input: string,
  ): Promise<{ externalUrl: string; preview: FussballPagePreview }> {
    throw importsDisabledError()
  }
}

function importsDisabledError() {
  return new ServiceUnavailableException(
    'Automated DFB/FUSSBALL.DE imports are disabled. Save the official team-page link instead.',
  )
}
