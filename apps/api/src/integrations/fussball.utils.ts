import type {
  FixtureDataConfidence,
  ImportedFixtureStatus,
  TableSnapshotRow,
} from '@anstoss/shared'

export type ApiFussballGame = {
  /**
   * The upstream's real match id (fussball.de game id from the scraper). Used
   * as the fixture's externalMatchId so the enrichment endpoint
   * (scraper.getGame) can fetch this exact match's events. Falls back to a
   * synthetic id (buildExternalMatchId) when absent.
   */
  matchId?: string | null
  date?: string
  time?: string
  status?: string
  competition?: string
  homeTeam?: string
  awayTeam?: string
  homeScore?: string | number | null
  awayScore?: string | number | null
  homeLogo?: string | null
  awayLogo?: string | null
}

export type ApiFussballTableRow = {
  place?: string | number
  team?: string
  img?: string | null
  games?: string | number
  won?: string | number
  draw?: string | number
  lost?: string | number
  goal?: string
  goalDifference?: string | number
  points?: string | number
  isPromotion?: boolean
  isRelegation?: boolean
}

export interface FussballPagePreview {
  label: string
  competition: string | null
  pitchAddress: string | null
}

export interface FussballRosterPlayer {
  name: string
  jerseyNumber: number | null
  externalPlayerId: string | null
}

export interface FussballRoster {
  players: FussballRosterPlayer[]
  rawCount: number
}

const TEAM_ID_PATTERN = /\b[0-9A-Z]{24,36}\b/
const HTML_TAG_PATTERN = /<[^>]+>/g

export function extractFussballTeamId(input: string): string | null {
  const directMatch = input.trim().toUpperCase().match(TEAM_ID_PATTERN)
  if (directMatch) {
    return directMatch[0]
  }

  try {
    const parsed = new URL(input.trim())
    const pathnameMatch = parsed.pathname.toUpperCase().match(TEAM_ID_PATTERN)
    if (pathnameMatch) {
      return pathnameMatch[0]
    }
  } catch {
    return null
  }

  return null
}

export function buildFussballTeamUrl(teamId: string) {
  return `https://next.fussball.de/mannschaft/-/${teamId}`
}

export function buildFussballTeamRosterUrl(teamId: string) {
  // The "Kader" subpage on next.fussball.de lists every registered
  // squad player with jersey numbers. Falls back to the main team page
  // if the subpage 404s.
  return `https://next.fussball.de/mannschaft/-/team-id/${teamId}#!/section/team-mates`
}

const ROSTER_PLAYER_LINK_PATTERN =
  /<a[^>]+href="[^"]*\/spieler\/-\/spieler-id\/([0-9A-Z]{16,40})"[^>]*>([\s\S]*?)<\/a>/gi
const ROSTER_NUMBER_NEAR_PATTERN = /class="[^"]*(?:nummer|number|trikot|squad-number)[^"]*"[^>]*>\s*(\d{1,3})\s*</gi

/**
 * Best-effort scrape of player names + jersey numbers from a
 * fussball.de team page. The site's HTML evolves; we degrade
 * gracefully — an empty roster is the right answer when the parser
 * can't find anything, not a thrown error. The caller should treat an
 * empty `players` array as "scrape failed; ask the admin to enter
 * names manually".
 */
export function parseFussballRoster(html: string): FussballRoster {
  const normalized = normalizeWhitespace(html)
  const seen = new Set<string>()
  const players: FussballRosterPlayer[] = []
  let rawCount = 0

  // Pass 1: anchor-based detection — every player has a link to their
  // detail page. Pulls name + external ID together.
  for (const match of normalized.matchAll(ROSTER_PLAYER_LINK_PATTERN)) {
    rawCount += 1
    const externalPlayerId = match[1] ?? null
    const inner = (match[2] ?? '').replace(HTML_TAG_PATTERN, ' ')
    const name = decodeHtmlEntities(inner).replace(/\s+/g, ' ').trim()
    if (!name) continue
    const dedupeKey = (externalPlayerId || name).toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    players.push({ name, jerseyNumber: null, externalPlayerId })
  }

  // Pass 2: try to attach jersey numbers by scanning for numeric badges
  // near each player anchor. Cheap heuristic — if it ever wires up
  // wrong, the admin can edit before sending the invite.
  if (players.length > 0) {
    const numberCandidates: number[] = []
    for (const m of normalized.matchAll(ROSTER_NUMBER_NEAR_PATTERN)) {
      const value = parseInt(m[1] ?? '', 10)
      if (Number.isFinite(value) && value > 0 && value < 100) {
        numberCandidates.push(value)
      }
    }
    if (numberCandidates.length === players.length) {
      for (let i = 0; i < players.length; i++) {
        players[i] = { ...players[i], jerseyNumber: numberCandidates[i] ?? null }
      }
    }
  }

  return { players, rawCount }
}

export function parseFussballTeamPage(html: string, fallbackLabel: string): FussballPagePreview {
  const normalizedHtml = normalizeWhitespace(html)
  const label =
    extractMetaContent(normalizedHtml, 'property="og:title"') ||
    extractTagText(normalizedHtml, 'h1') ||
    fallbackLabel

  const competition =
    extractLabeledText(
      normalizedHtml,
      /Wettbewerb(?:e)?/i,
      [
        'Tabellenplatz',
        'Punkte',
        'Torverhältnis',
        'Spielklasse',
        'Kader',
        'Spielstätten',
        'Adresse',
      ],
    ) ||
    extractLabeledText(
      normalizedHtml,
      /Spielklasse/i,
      [
        'Tabellenplatz',
        'Punkte',
        'Torverhältnis',
        'Kader',
        'Spielstätten',
        'Adresse',
      ],
    )

  const structuredAddress = extractStructuredAddress(normalizedHtml)
  const pitchAddress =
    structuredAddress ||
    extractLabeledText(
      normalizedHtml,
      /Spielst[aä]tten[\s\S]*?Adresse/i,
      ['Der Verein', 'Saison', 'Anreise', 'Die Mannschaft'],
    ) ||
    null

  return {
    label: decodeHtmlEntities(label).trim(),
    competition: competition ? decodeHtmlEntities(competition).trim() : null,
    pitchAddress: pitchAddress ? decodeHtmlEntities(pitchAddress).trim() : null,
  }
}

export function parseApiFussballKickoff(
  dateText: string | undefined,
  timeText: string | undefined,
): Date | null {
  if (!dateText) {
    return null
  }

  const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
  if (!dateMatch) {
    return null
  }

  const day = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const yearText = dateMatch[3]
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
  const timeMatch = timeText?.match(/(\d{1,2}):(\d{2})/)
  const hours = timeMatch ? Number(timeMatch[1]) : 0
  const minutes = timeMatch ? Number(timeMatch[2]) : 0
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

export function normalizeImportedFixtureStatus(
  value: string | undefined,
): ImportedFixtureStatus {
  const normalized = (value || '').toLowerCase()

  if (normalized.includes('live')) return 'live'
  if (normalized.includes('abgesagt') || normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('verlegt') || normalized.includes('postpon')) return 'postponed'
  if (
    normalized.includes('beendet') ||
    normalized.includes('abpfiff') ||
    normalized.includes('final') ||
    normalized.includes('ft')
  ) {
    return 'finished'
  }
  if (
    normalized.includes('angesetzt') ||
    normalized.includes('scheduled') ||
    normalized.includes('terminiert')
  ) {
    return 'scheduled'
  }

  return 'unknown'
}

export function mapTableRows(rows: ApiFussballTableRow[] | undefined): TableSnapshotRow[] {
  return (rows || [])
    .map((row) => ({
      place: toInt(row.place),
      team: row.team?.trim() || 'Unknown',
      img: row.img || null,
      games: toInt(row.games),
      won: toInt(row.won),
      draw: toInt(row.draw),
      lost: toInt(row.lost),
      goal: row.goal?.trim() || '0:0',
      goalDifference: toInt(row.goalDifference),
      points: toInt(row.points),
      isPromotion: Boolean(row.isPromotion),
      isRelegation: Boolean(row.isRelegation),
    }))
    .filter((row) => row.place > 0)
}

export function inferLinkedTeamPerspective(
  linkedLabel: string,
  homeTeam: string,
  awayTeam: string,
) {
  const normalizedLinkedLabel = normalizeTeamName(linkedLabel)
  const normalizedHome = normalizeTeamName(homeTeam)
  const normalizedAway = normalizeTeamName(awayTeam)

  if (normalizedLinkedLabel === normalizedHome) {
    return { isHome: true, opponent: awayTeam }
  }

  if (normalizedLinkedLabel === normalizedAway) {
    return { isHome: false, opponent: homeTeam }
  }

  if (normalizedHome.includes(normalizedLinkedLabel)) {
    return { isHome: true, opponent: awayTeam }
  }

  if (normalizedAway.includes(normalizedLinkedLabel)) {
    return { isHome: false, opponent: homeTeam }
  }

  return {
    isHome: null,
    opponent: awayTeam,
  }
}

export function buildExternalMatchId(input: {
  externalTeamId: string
  competition: string
  kickoffAt: Date
  homeTeam: string
  awayTeam: string
}) {
  return [
    input.externalTeamId,
    input.kickoffAt.toISOString(),
    normalizeTeamName(input.competition),
    normalizeTeamName(input.homeTeam),
    normalizeTeamName(input.awayTeam),
  ].join('__')
}

export function calculateFormStreak(
  fixtures: Array<{
    kickoffAt: string
    status: ImportedFixtureStatus
    homeTeam: string
    awayTeam: string
    resultHome: number | null
    resultAway: number | null
  }>,
  linkedLabel: string,
) {
  return fixtures
    .filter(
      (fixture) =>
        fixture.status === 'finished' &&
        fixture.resultHome !== null &&
        fixture.resultAway !== null,
    )
    .sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt))
    .slice(0, 5)
    .map((fixture) => {
      const perspective = inferLinkedTeamPerspective(
        linkedLabel,
        fixture.homeTeam,
        fixture.awayTeam,
      )

      if (perspective.isHome === null) {
        return 'U'
      }

      const ownScore = perspective.isHome ? fixture.resultHome : fixture.resultAway
      const opponentScore = perspective.isHome ? fixture.resultAway : fixture.resultHome

      if (ownScore === null || opponentScore === null) {
        return 'U'
      }

      if (ownScore === opponentScore) return 'D'
      return ownScore > opponentScore ? 'W' : 'L'
    })
}

export function collectFixtureChanges(
  previous: {
    kickoffAt: string
    venueName: string | null
    pitchAddress: string | null
    status: ImportedFixtureStatus
    resultHome: number | null
    resultAway: number | null
  },
  next: {
    kickoffAt: string
    venueName: string | null
    pitchAddress: string | null
    status: ImportedFixtureStatus
    resultHome: number | null
    resultAway: number | null
  },
  lockedFields: string[],
) {
  const changes: string[] = []
  const locked = new Set(lockedFields)

  if (!locked.has('kickoffAt') && previous.kickoffAt !== next.kickoffAt) {
    changes.push('kickoff')
  }
  if (!locked.has('venueName') && previous.venueName !== next.venueName) {
    changes.push('venue')
  }
  if (!locked.has('pitchAddress') && previous.pitchAddress !== next.pitchAddress) {
    changes.push('pitchAddress')
  }
  if (!locked.has('status') && previous.status !== next.status) {
    changes.push('status')
  }
  if (
    (!locked.has('resultHome') && previous.resultHome !== next.resultHome) ||
    (!locked.has('resultAway') && previous.resultAway !== next.resultAway)
  ) {
    changes.push('result')
  }

  return changes
}

export function confidenceFromSources(hasApiData: boolean, hasPageEnrichment: boolean): FixtureDataConfidence {
  if (hasApiData && hasPageEnrichment) return 'mixed'
  if (hasPageEnrichment) return 'unofficial_public'
  if (hasApiData) return 'unofficial_public'
  return 'club_entered'
}

export function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s\-_.]+/g, ' ')
    .replace(/[^a-z0-9äöüß ]/g, '')
    .trim()
}

function toInt(value: string | number | undefined | null) {
  const numberValue = typeof value === 'number' ? value : Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ')
}

function extractMetaContent(html: string, marker: string) {
  const regex = new RegExp(
    `<meta[^>]+${marker}[^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  )
  return html.match(regex)?.[1] || null
}

function extractTagText(html: string, tagName: string) {
  const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, 'i')
  return html.match(regex)?.[1]?.replace(HTML_TAG_PATTERN, ' ') || null
}

function extractStructuredAddress(html: string) {
  const street =
    html.match(/streetAddress["']?\s*[:=]\s*["']([^"']+)["']/i)?.[1] ||
    html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i)?.[1]
  const postalCode =
    html.match(/postalCode["']?\s*[:=]\s*["']([^"']+)["']/i)?.[1] ||
    html.match(/itemprop=["']postalCode["'][^>]*>([^<]+)/i)?.[1]
  const locality =
    html.match(/addressLocality["']?\s*[:=]\s*["']([^"']+)["']/i)?.[1] ||
    html.match(/itemprop=["']addressLocality["'][^>]*>([^<]+)/i)?.[1]

  const parts = [street, [postalCode, locality].filter(Boolean).join(' ')].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function extractLabeledText(
  html: string,
  label: RegExp,
  stopWords: string[],
) {
  const plainText = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(HTML_TAG_PATTERN, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()

  const match = plainText.match(label)
  if (!match || match.index === undefined) {
    return null
  }

  const afterLabel = plainText.slice(match.index + match[0].length).trim()
  if (!afterLabel) {
    return null
  }

  let endIndex = afterLabel.length
  stopWords.forEach((word) => {
    const index = afterLabel.indexOf(word)
    if (index > 0) {
      endIndex = Math.min(endIndex, index)
    }
  })

  const extracted = afterLabel.slice(0, endIndex).replace(/\s+/g, ' ').trim()
  return extracted || null
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&uuml;/g, 'ü')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&szlig;/g, 'ß')
    .replace(/&nbsp;/g, ' ')
  }
