import type {
  StudioBrandKit,
  StudioElements,
  StudioOutcome,
  StudioPlayerConsent,
  StudioTemplate,
} from '@anstoss/shared'
import { STUDIO_OPPONENT_FALLBACK } from '../theme/studio'

/**
 * Matchday Studio template data builder.
 *
 * Turns the match record (event, coach-recorded live state, lineup) and the
 * brand kit into the texts a template draws. Nothing in a template is fixed
 * text. Pure: no hooks, no network, so every data rule is unit-tested.
 *
 * Blocking consent rules (REVAMP_HANDOFF "Consent and privacy"), enforced
 * here for every template:
 *  - a player without photo consent is never placed in a graphic,
 *  - a name is used only when the player has not opted out of public naming,
 *  - minors need the parental consent for photo and for name,
 *  - a player the consent list does not know counts as "no" (fail closed).
 */

export type Translate = (key: string, options?: Record<string, unknown>) => string

export type StudioMatchState =
  | 'SCHEDULED'
  | 'FIRST_HALF'
  | 'HALF_TIME'
  | 'SECOND_HALF'
  | 'FINISHED'
  | 'ABANDONED'
  | 'CANCELLED'

export type StudioMatchEvent = {
  id: string
  kind: 'GOAL' | 'CONCEDED' | 'YELLOW' | 'RED' | 'SUB'
  minute: number
  playerUserId: string | null
  playerName: string | null
  /** Assist on a GOAL. */
  relatedUserId?: string | null
  ownGoal?: boolean
  createdAt?: string
}

export type StudioLineupPlayer = {
  userId?: string | null
  name: string
  number?: number | null
  position?: string | null
}

export type StudioMatchInput = {
  club: { name: string; color: string; crestUrl?: string | null }
  /** Null when the Studio has no match to bind to. */
  opponent: { name: string; color?: string | null } | null
  homeAway: 'HOME' | 'AWAY' | null
  /** ISO kick-off. */
  date: string | null
  venue: string | null
  competition: { name: string; matchday: number | null } | null
  state: StudioMatchState
  /** True once a live state or result exists for the match. */
  hasLiveData: boolean
  goalsFor: number
  goalsAgainst: number
  halfTime?: { goalsFor: number; goalsAgainst: number } | null
  shootout?: { goalsFor: number; goalsAgainst: number } | null
  events: StudioMatchEvent[]
  lineup: { formation: string; starters: StudioLineupPlayer[] } | null
  consents: StudioPlayerConsent[]
}

export type StudioGraphicOptions = {
  template: StudioTemplate
  elements: StudioElements
  /** "Ergebnis eintragen": a score typed in the editor, for this graphic only. */
  scoreOverride?: { goalsFor: number; goalsAgainst: number } | null
  /** Free text for News and Sponsor-Dank. */
  text?: { headline?: string; body?: string }
  /** Sponsor shown in the footer and on Sponsor-Dank (brand kit order). */
  sponsorId?: string | null
  locale: string
  t: Translate
  /** RTL mirrors home/away. */
  rtl?: boolean
  now?: Date
}

export type StudioTeamSide = {
  name: string
  short: string
  color: string
  crestUrl: string | null
  isClub: boolean
}

export type StudioGraphicData = {
  template: StudioTemplate
  header: {
    clubName: string
    clubShort: string
    clubColor: string
    crestUrl: string | null
    /** "Kreisliga C · Saison 26/27"; null when switched off or unknown. */
    competition: string | null
  }
  footer: { handle: string | null; sponsor: string | null }
  /** Fixture order: home first (left). Mirrored in RTL. */
  left: StudioTeamSide
  right: StudioTeamSide
  outcome: StudioOutcome | null
  /** "Sieg!" / "Unentschieden" / "Endstand" / "Halbzeit" / "Abgebrochen" / "Abgesagt". */
  kicker: string
  /** "3:1" in fixture order. */
  score: string
  /** "Osei 23' · Kaya 58'"; null at 0 own goals. */
  scorers: string | null
  /** "5:4 n.E." */
  shootout: string | null
  matchday: { kicker: string; date: string; time: string; opponent: string; venue: string | null }
  lineup: { title: string; meta: string; rows: Array<{ label: string; names: string }> }
  /** Null at 0 own goals: the Tor template is disabled. */
  goal: { headline: string; ghost: string; scorer: string; chip: string } | null
  /** Null when no player may be named. */
  motm: { kicker: string; lines: string[]; stats: string; photoUrl: string | null } | null
  motmLabel: string
  news: { kicker: string; headline: string; body: string }
  sponsor: { kicker: string; lines: string[]; body: string }
  /** Templates that cannot be built from this match. */
  disabled: StudioTemplate[]
}

// ─── Consent ────────────────────────────────────────────────────────────────

type ConsentIndex = Map<string, StudioPlayerConsent>

export function canUsePlayerName(consent: StudioPlayerConsent | null | undefined): boolean {
  if (!consent || !consent.publicNaming) return false
  if (consent.isMinor) return Boolean(consent.parentalConsent?.name)
  return true
}

export function canUsePlayerPhoto(consent: StudioPlayerConsent | null | undefined): boolean {
  if (!consent || !consent.photoConsent) return false
  if (consent.isMinor) return Boolean(consent.parentalConsent?.photo)
  return true
}

function indexConsents(consents: StudioPlayerConsent[]): ConsentIndex {
  return new Map(consents.map((c) => [c.userId, c]))
}

/** The name as the graphic may print it, or null. */
function publicName(index: ConsentIndex, userId: string | null | undefined, name: string | null | undefined) {
  if (!userId || !name?.trim()) return null
  return canUsePlayerName(index.get(userId)) ? name.trim() : null
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/** "SV Spreewiese 1921" → "SVS"; single words → first three letters. */
export function studioShortCode(name: string): string {
  const words = name
    .replace(/[0-9]+/g, '')
    .replace(/\b(I{1,3}|IV|V)\b\.?$/u, '')
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length <= 1) return (words[0] ?? name).slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? name
}

/** Football season of a date: July to June. "26/27". */
export function studioSeason(date: Date): string {
  const start = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
  const two = (y: number) => String(y % 100).padStart(2, '0')
  return `${two(start)}/${two(start + 1)}`
}

export function studioOutcome(goalsFor: number, goalsAgainst: number): StudioOutcome {
  return goalsFor > goalsAgainst ? 'WIN' : goalsFor === goalsAgainst ? 'DRAW' : 'LOSS'
}

function byTime(a: StudioMatchEvent, b: StudioMatchEvent) {
  return a.minute - b.minute || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

const POSITION_GROUP: Record<string, 'gk' | 'def' | 'mid' | 'att'> = {
  GK: 'gk', TW: 'gk', GOALKEEPER: 'gk',
  LB: 'def', RB: 'def', CB: 'def', LWB: 'def', RWB: 'def', DEF: 'def', DEFENDER: 'def',
  CM: 'mid', CDM: 'mid', CAM: 'mid', LM: 'mid', RM: 'mid', MID: 'mid', MIDFIELDER: 'mid',
  ST: 'att', LW: 'att', RW: 'att', CF: 'att', FW: 'att', FWD: 'att', ATT: 'att', FORWARD: 'att',
}
const GROUP_ORDER = ['gk', 'def', 'mid', 'att'] as const

function lineupRows(
  lineup: StudioMatchInput['lineup'],
  index: ConsentIndex,
  t: Translate,
): Array<{ label: string; names: string }> {
  if (!lineup || lineup.starters.length === 0) return []
  const groups: Record<(typeof GROUP_ORDER)[number], string[]> = { gk: [], def: [], mid: [], att: [] }
  // Without positions, split the starters by the formation: 1 + "4-3-3".
  const lines = lineup.formation.split('-').map((n) => Number.parseInt(n, 10)).filter((n) => n > 0)
  const byFormation = (i: number): (typeof GROUP_ORDER)[number] => {
    if (i === 0) return 'gk'
    if (lines.length === 0) return 'mid'
    let seen = 1
    for (let line = 0; line < lines.length; line += 1) {
      seen += lines[line]
      if (i < seen) return line === 0 ? 'def' : line === lines.length - 1 ? 'att' : 'mid'
    }
    return 'att'
  }
  lineup.starters.forEach((player, i) => {
    const name = publicName(index, player.userId, player.name)
    // No consent: the shirt number stands in, never the name.
    const label = name
      ? surname(name)
      : player.number != null
        ? t('studio.graphic.shirt', { number: player.number })
        : null
    if (!label) return
    const group = POSITION_GROUP[(player.position ?? '').toUpperCase()] ?? byFormation(i)
    groups[group].push(label)
  })
  return GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => ({
    label: t(`studio.graphic.position.${g}`),
    names: groups[g].join(' · '),
  }))
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildGraphicData(
  match: StudioMatchInput,
  kit: Pick<StudioBrandKit, 'handle' | 'sponsors'> | null,
  options: StudioGraphicOptions,
): StudioGraphicData {
  const { t, locale, elements } = options
  const index = indexConsents(match.consents)
  const now = options.now ?? new Date()
  const date = match.date ? new Date(match.date) : null
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null

  const clubSide: StudioTeamSide = {
    name: match.club.name,
    short: studioShortCode(match.club.name),
    color: match.club.color,
    crestUrl: match.club.crestUrl ?? null,
    isClub: true,
  }
  const opponentName = match.opponent?.name?.trim() || t('studio.graphic.opponentFallback')
  const opponentSide: StudioTeamSide = {
    name: opponentName,
    short: match.opponent ? studioShortCode(opponentName) : '?',
    color: match.opponent?.color || STUDIO_OPPONENT_FALLBACK,
    crestUrl: null,
    isClub: false,
  }
  // Home team first, on the left. In RTL the order mirrors.
  const clubIsHome = match.homeAway !== 'AWAY'
  const clubLeft = options.rtl ? !clubIsHome : clubIsHome
  const [left, right] = clubLeft ? [clubSide, opponentSide] : [opponentSide, clubSide]
  const inOrder = (own: number, theirs: number) =>
    clubLeft ? `${own}:${theirs}` : `${theirs}:${own}`

  // Score: an editor override applies to this graphic only.
  const override = options.scoreOverride ?? null
  const ownGoalEvents = match.events.filter((e) => e.kind === 'GOAL').sort(byTime)
  const template = options.template
  const atBreak = template === 'HALF_TIME'
  let goalsFor = override ? override.goalsFor : match.goalsFor
  let goalsAgainst = override ? override.goalsAgainst : match.goalsAgainst
  let shownGoals = ownGoalEvents
  if (atBreak && !override && (match.state === 'SECOND_HALF' || match.state === 'FINISHED')) {
    // Second half already running: the break score, not the current one.
    goalsFor = match.halfTime?.goalsFor ?? ownGoalEvents.filter((e) => e.minute <= 45).length
    goalsAgainst =
      match.halfTime?.goalsAgainst ??
      match.events.filter((e) => e.kind === 'CONCEDED' && e.minute <= 45).length
    shownGoals = ownGoalEvents.filter((e) => e.minute <= 45)
  }
  shownGoals = shownGoals.slice(0, Math.max(0, goalsFor))

  const scorerLabel = (event: StudioMatchEvent, full: boolean) => {
    const minute = `${event.minute}'`
    if (event.ownGoal) return `${t('studio.graphic.ownGoal')} ${minute}`
    const name = publicName(index, event.playerUserId, event.playerName)
    if (!name) return minute
    return `${full ? name : surname(name)} ${minute}`
  }
  // 0 own goals hides the scorers line.
  const scorers = goalsFor > 0 && shownGoals.length > 0
    ? shownGoals.map((e) => scorerLabel(e, false)).join(' · ')
    : null

  const shootout = match.shootout && !atBreak && !override ? match.shootout : null
  const outcome: StudioOutcome | null =
    match.state === 'ABANDONED' || match.state === 'CANCELLED'
      ? null
      : shootout
        ? studioOutcome(shootout.goalsFor, shootout.goalsAgainst)
        : studioOutcome(goalsFor, goalsAgainst)
  const kicker =
    match.state === 'CANCELLED'
      ? t('studio.graphic.cancelled')
      : match.state === 'ABANDONED'
        ? t('studio.graphic.abandoned')
        : atBreak
          ? t('studio.graphic.halfTime')
          : outcome === 'WIN'
            ? t('studio.graphic.win')
            : outcome === 'DRAW'
              ? t('studio.graphic.draw')
              : t('studio.graphic.fullTime')

  // Spieltag
  const weekday = validDate
    ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(validDate).replace('.', '')
    : ''
  const dayMonth = validDate
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(validDate)
    : ''
  const dateText = validDate ? `${weekday} ${dayMonth}${/\.$/.test(dayMonth) ? '' : '.'}` : t('studio.graphic.dateOpen')
  const timeText = validDate
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(validDate)
    : ''
  const versus = t(`studio.graphic.${clubIsHome ? 'versusHome' : 'versusAway'}`, { opponent: opponentName })

  // Tor: the latest own goal and the score at that moment.
  const lastGoal = goalsFor > 0 ? shownGoals[shownGoals.length - 1] ?? null : null
  let goal: StudioGraphicData['goal'] = null
  if (goalsFor > 0) {
    const ownAt = lastGoal ? shownGoals.length : goalsFor
    const theirsAt = lastGoal
      ? Math.min(
          goalsAgainst,
          match.events.filter((e) => e.kind === 'CONCEDED' && byTime(e, lastGoal) <= 0).length,
        )
      : goalsAgainst
    goal = {
      headline: t('studio.graphic.goal'),
      ghost: t('studio.graphic.goalGhost'),
      scorer: lastGoal ? scorerLabel(lastGoal, true) : '',
      chip: `${left.short} ${inOrder(ownAt, theirsAt)} ${right.short}`,
    }
  }

  // Spieler des Spiels: most goals, then assists; only players who may be named.
  const tally = new Map<string, { name: string; goals: number; assists: number }>()
  for (const event of ownGoalEvents) {
    if (event.ownGoal) continue
    const scorer = publicName(index, event.playerUserId, event.playerName)
    if (scorer && event.playerUserId) {
      const row = tally.get(event.playerUserId) ?? { name: scorer, goals: 0, assists: 0 }
      row.goals += 1
      tally.set(event.playerUserId, row)
    }
    if (event.relatedUserId && canUsePlayerName(index.get(event.relatedUserId))) {
      const row = tally.get(event.relatedUserId)
      if (row) row.assists += 1
    }
  }
  const best = [...tally.entries()].sort(
    (a, b) => b[1].goals - a[1].goals || b[1].assists - a[1].assists,
  )[0]
  const motm: StudioGraphicData['motm'] = best
    ? {
        kicker: t('studio.graphic.motm'),
        lines: best[1].name.split(/\s+/).slice(0, 3),
        stats: [
          t('studio.graphic.goals', { count: best[1].goals }),
          best[1].assists > 0 ? t('studio.graphic.assists', { count: best[1].assists }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        // Never a photo without photo consent.
        photoUrl: canUsePlayerPhoto(index.get(best[0])) ? index.get(best[0])?.cutoutUrl ?? null : null,
      }
    : null

  const sponsors = kit?.sponsors ?? []
  const sponsor = sponsors.find((s) => s.id === options.sponsorId) ?? sponsors[0] ?? null
  const sponsorName = sponsor?.name ?? t('studio.graphic.sponsorFallback')
  const season = studioSeason(validDate ?? now)

  const disabled: StudioTemplate[] = ['CLIP_OVERLAY']
  if (!goal) disabled.push('GOAL')
  if (!motm) disabled.push('PLAYER_OF_THE_MATCH')

  const rows = lineupRows(match.lineup, index, t)

  return {
    template,
    header: {
      clubName: match.club.name,
      clubShort: clubSide.short,
      clubColor: match.club.color,
      crestUrl: match.club.crestUrl ?? null,
      competition: elements.competition
        ? [match.competition?.name, t('studio.graphic.season', { season })].filter(Boolean).join(' · ')
        : null,
    },
    footer: {
      handle: elements.handle ? kit?.handle ?? null : null,
      sponsor: elements.sponsor ? sponsor?.name ?? null : null,
    },
    left,
    right,
    outcome,
    kicker,
    score: inOrder(goalsFor, goalsAgainst),
    scorers,
    shootout: shootout
      ? t('studio.graphic.shootout', { score: inOrder(shootout.goalsFor, shootout.goalsAgainst) })
      : null,
    matchday: {
      kicker: match.competition?.matchday
        ? t('studio.graphic.matchday', { number: match.competition.matchday })
        : t('studio.graphic.nextMatch'),
      date: dateText,
      time: timeText,
      opponent: opponentName,
      venue: match.venue?.split(',')[0]?.trim() || null,
    },
    lineup: {
      title: t('studio.graphic.lineup'),
      meta: [validDate ? dateText : null, timeText || null, versus].filter(Boolean).join(' · '),
      rows,
    },
    goal,
    motm,
    motmLabel: t('studio.graphic.motm'),
    news: {
      kicker: t('studio.graphic.newsKicker', {
        date: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(now),
      }),
      headline: options.text?.headline?.trim() || t('studio.graphic.newsHeadline'),
      body: options.text?.body?.trim() ?? t('studio.graphic.newsBody'),
    },
    sponsor: {
      kicker: t('studio.graphic.sponsorKicker'),
      lines: sponsorName.split(/\s+/).slice(0, 3),
      body: options.text?.body?.trim() ?? t('studio.graphic.sponsorBody', { season }),
    },
    disabled,
  }
}

/** A template falls back to Endstand when the match cannot fill it (Tor at 0 goals). */
export function resolveTemplate(template: StudioTemplate, data: Pick<StudioGraphicData, 'disabled'>): StudioTemplate {
  return data.disabled.includes(template) ? 'FULL_TIME' : template
}

/** Free caption built from the same facts; the AI rewrite costs a credit. */
export function buildCaption(
  data: StudioGraphicData,
  kit: Pick<StudioBrandKit, 'hashtags'> | null,
  t: Translate,
  take = 0,
): string {
  const tags = (kit?.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const opponent = data.left.isClub ? data.right.name : data.left.name
  const base = {
    score: data.score,
    opponent,
    scorers: data.scorers ? t('studio.caption.scorers', { scorers: data.scorers }) : '',
    club: data.header.clubName,
  }
  const variant = take % 2 === 0 ? 'a' : 'b'
  let text: string
  switch (data.template) {
    case 'MATCHDAY':
      text = t('studio.caption.matchday', { ...base, date: data.matchday.date, time: data.matchday.time, venue: data.matchday.venue ?? '' })
      break
    case 'LINEUP':
      text = t('studio.caption.lineup', base)
      break
    case 'HALF_TIME':
      text = t('studio.caption.halfTime', base)
      break
    case 'GOAL':
      text = t('studio.caption.goal', { ...base, scorer: data.goal?.scorer ?? '', chip: data.goal?.chip ?? '' })
      break
    case 'PLAYER_OF_THE_MATCH':
      text = t('studio.caption.motm', { ...base, player: data.motm?.lines.join(' ') ?? '' })
      break
    case 'NEWS':
      text = [data.news.headline, data.news.body].filter(Boolean).join('. ')
      break
    case 'SPONSOR':
      text = t('studio.caption.sponsor', { ...base, sponsor: data.sponsor.lines.join(' ') })
      break
    default:
      // Loss: respectful, never mocking the opponent.
      text = data.outcome
        ? t(`studio.caption.${data.outcome === 'WIN' ? 'win' : data.outcome === 'DRAW' ? 'draw' : 'loss'}.${variant}`, base)
        : t('studio.caption.noResult', { ...base, status: data.kicker })
  }
  return [text.replace(/\s+/g, ' ').replace(/\s([.,!])/g, '$1').trim(), tags].filter(Boolean).join(' ')
}
