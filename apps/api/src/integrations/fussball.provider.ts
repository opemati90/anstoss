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

interface ApiFussballMatchResponse {
  data?: {
    formationHome?: string | null
    formationAway?: string | null
    lineupHome?: ApiFussballPlayer[]
    lineupAway?: ApiFussballPlayer[]
    benchHome?: ApiFussballPlayer[]
    benchAway?: ApiFussballPlayer[]
  }
  formationHome?: string | null
  formationAway?: string | null
  lineupHome?: ApiFussballPlayer[]
  lineupAway?: ApiFussballPlayer[]
  benchHome?: ApiFussballPlayer[]
  benchAway?: ApiFussballPlayer[]
}

@Injectable()
export class FussballProviderService {
  private readonly apiBaseUrl =
    process.env.FUSSBALL_API_URL || 'https://api-fussball.de'
  private readonly apiToken =
    process.env.FUSSBALL_API_TOKEN || process.env.API_FUSSBALL_TOKEN
  private readonly requestTimeoutMs = 12000

  async fetchTeamBundle(externalTeamId: string): Promise<ApiFussballTeamBundle> {
    if (!this.apiToken) {
      throw new ServiceUnavailableException(
        'FUSSBALL_API_TOKEN is required to import fixtures from api-fussball.de',
      )
    }

    const response = await this.fetchWithTimeout(
      `${this.apiBaseUrl.replace(/\/$/, '')}/team?teamId=${encodeURIComponent(externalTeamId)}`,
      {
        headers: {
          'x-auth-token': this.apiToken,
          Accept: 'application/json',
        },
      },
      'loading fixtures',
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

  /**
   * Fetch starting XI / bench from api-fussball.de for a given match.
   * Returns null when the upstream does not yet expose lineup data for this
   * match (most amateur fixtures don't until the coach posts the squad).
   *
   * The api-fussball.de v2 schema for `/match?matchId=...` is documented to
   * include `lineupHome`, `lineupAway` and `bench*` arrays; we read defensively
   * so a partial / missing payload becomes `null` instead of an error.
   */
  async fetchMatchLineup(externalMatchId: string): Promise<ApiFussballLineupBundle | null> {
    if (!this.apiToken) return null

    const response = await this.fetchWithTimeout(
      `${this.apiBaseUrl.replace(/\/$/, '')}/match?matchId=${encodeURIComponent(externalMatchId)}`,
      {
        headers: {
          'x-auth-token': this.apiToken,
          Accept: 'application/json',
        },
      },
      'loading lineup',
    )

    if (response.status === 404) return null
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `api-fussball.de returned ${response.status} while loading lineup`,
      )
    }

    const payload = (await response.json()) as ApiFussballMatchResponse
    const data = payload.data || payload
    if (!data || (!data.lineupHome && !data.lineupAway)) return null

    return {
      home: {
        formation: data.formationHome ?? null,
        starters: Array.isArray(data.lineupHome) ? data.lineupHome : [],
        bench: Array.isArray(data.benchHome) ? data.benchHome : [],
      },
      away: {
        formation: data.formationAway ?? null,
        starters: Array.isArray(data.lineupAway) ? data.lineupAway : [],
        bench: Array.isArray(data.benchAway) ? data.benchAway : [],
      },
    }
  }

  async fetchTeamPage(input: string): Promise<{ externalUrl: string; preview: FussballPagePreview }> {
    const externalUrl = buildTeamPageUrl(input)
    const response = await this.fetchWithTimeout(
      externalUrl,
      {
        headers: {
          Accept: 'text/html',
        },
        redirect: 'error',
      },
      'loading the team page',
    )

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

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    action: string,
  ) {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    )

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `FUSSBALL.DE timed out while ${action}`,
        )
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

function buildTeamPageUrl(input: string) {
  const trimmedInput = input.trim()

  if (trimmedInput.includes('://')) {
    const parsed = new URL(trimmedInput)
    const host = parsed.hostname.toLowerCase()

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !ALLOWED_FUSSBALL_HOSTS.has(host)
    ) {
      throw new ServiceUnavailableException(
        'Only canonical FUSSBALL.DE team URLs are allowed',
      )
    }
  }

  const externalTeamId = extractFussballTeamId(trimmedInput)
  if (!externalTeamId) {
    throw new ServiceUnavailableException(
      'A valid FUSSBALL.DE team URL or ID is required',
    )
  }

  return buildFussballTeamUrl(externalTeamId)
}

const ALLOWED_FUSSBALL_HOSTS = new Set([
  'fussball.de',
  'www.fussball.de',
  'next.fussball.de',
])
