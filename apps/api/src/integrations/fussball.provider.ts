import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import {
  ApiFussballGame,
  ApiFussballTableRow,
  buildFussballTeamUrl,
  extractFussballTeamId,
  parseFussballTeamPage,
  type FussballPagePreview,
} from './fussball.utils'

type ApiFussballTeamResponse = {
  data?: {
    prevGames?: ApiFussballGame[]
    nextGames?: ApiFussballGame[]
    table?: ApiFussballTableRow[]
  }
  prevGames?: ApiFussballGame[]
  nextGames?: ApiFussballGame[]
  table?: ApiFussballTableRow[]
}

export interface ApiFussballTeamBundle {
  prevGames: ApiFussballGame[]
  nextGames: ApiFussballGame[]
  table: ApiFussballTableRow[]
}

@Injectable()
export class FussballProviderService {
  private readonly apiBaseUrl =
    process.env.FUSSBALL_API_URL || 'https://api-fussball.de'
  private readonly apiToken =
    process.env.FUSSBALL_API_TOKEN || process.env.API_FUSSBALL_TOKEN

  async fetchTeamBundle(externalTeamId: string): Promise<ApiFussballTeamBundle> {
    if (!this.apiToken) {
      throw new ServiceUnavailableException(
        'FUSSBALL_API_TOKEN is required to import fixtures from api-fussball.de',
      )
    }

    const response = await fetch(
      `${this.apiBaseUrl.replace(/\/$/, '')}/team?teamId=${encodeURIComponent(externalTeamId)}`,
      {
        headers: {
          'x-auth-token': this.apiToken,
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `api-fussball.de returned ${response.status} while loading fixtures`,
      )
    }

    const payload = (await response.json()) as ApiFussballTeamResponse
    const data = payload.data || payload

    return {
      prevGames: data.prevGames || [],
      nextGames: data.nextGames || [],
      table: data.table || [],
    }
  }

  async fetchTeamPage(input: string): Promise<{ externalUrl: string; preview: FussballPagePreview }> {
    const externalUrl = buildTeamPageUrl(input)
    const response = await fetch(externalUrl, {
      headers: {
        Accept: 'text/html',
      },
    })

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `FUSSBALL.DE returned ${response.status} while loading the team page`,
      )
    }

    const html = await response.text()
    const fallbackLabel = extractFussballTeamId(input) || input

    return {
      externalUrl,
      preview: parseFussballTeamPage(html, fallbackLabel),
    }
  }
}

function buildTeamPageUrl(input: string) {
  try {
    const parsed = new URL(input)
    return parsed.toString()
  } catch {
    const externalTeamId = extractFussballTeamId(input)
    if (!externalTeamId) {
      throw new ServiceUnavailableException('A valid FUSSBALL.DE team URL or ID is required')
    }

    return buildFussballTeamUrl(externalTeamId)
  }
}
