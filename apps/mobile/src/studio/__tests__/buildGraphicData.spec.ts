import type { StudioPlayerConsent } from '@anstoss/shared'
import {
  buildCaption,
  buildGraphicData,
  canUsePlayerName,
  canUsePlayerPhoto,
  resolveTemplate,
  studioSeason,
  studioShortCode,
  type StudioGraphicOptions,
  type StudioMatchEvent,
  type StudioMatchInput,
} from '../buildGraphicData'
import { buildSuggestion } from '../suggestion'
import { canBuyStudioCredits, canUseStudio } from '../access'

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key

const adult = (userId: string, patch: Partial<StudioPlayerConsent> = {}): StudioPlayerConsent => ({
  userId,
  photoConsent: true,
  publicNaming: true,
  isMinor: false,
  parentalConsent: null,
  cutoutUrl: `https://cdn.test/${userId}.png`,
  ...patch,
})

const goal = (id: string, minute: number, userId: string | null, name: string | null, extra: Partial<StudioMatchEvent> = {}): StudioMatchEvent => ({
  id,
  kind: 'GOAL',
  minute,
  playerUserId: userId,
  playerName: name,
  createdAt: `2026-11-15T13:${String(minute).padStart(2, '0')}:00.000Z`,
  ...extra,
})
const conceded = (id: string, minute: number): StudioMatchEvent => ({
  id,
  kind: 'CONCEDED',
  minute,
  playerUserId: null,
  playerName: null,
  createdAt: `2026-11-15T13:${String(minute).padStart(2, '0')}:30.000Z`,
})

function match(patch: Partial<StudioMatchInput> = {}): StudioMatchInput {
  return {
    club: { name: 'SV Spreewiese', color: '#0E3B2B' },
    opponent: { name: 'Rot-Weiß Köpenick III', color: '#B23A3A' },
    homeAway: 'HOME',
    date: '2026-11-15T13:00:00.000Z',
    venue: 'Sportplatz Dammweg, Berlin',
    competition: { name: 'Kreisliga C', matchday: 11 },
    state: 'FINISHED',
    hasLiveData: true,
    goalsFor: 3,
    goalsAgainst: 1,
    events: [
      goal('g1', 23, 'osei', 'Kofi Osei'),
      goal('g2', 58, 'kaya', 'Emre Kaya', { relatedUserId: 'osei' }),
      conceded('c1', 64),
      goal('g3', 71, 'osei', 'Kofi Osei'),
    ],
    lineup: {
      formation: '4-4-2',
      starters: [
        { userId: 'wagner', name: 'Jonas Wagner', number: 1, position: 'GK' },
        { userId: 'nowak', name: 'Tomasz Nowak', number: 4, position: 'CB' },
        { userId: 'kaya', name: 'Emre Kaya', number: 11, position: 'RM' },
        { userId: 'osei', name: 'Kofi Osei', number: 9, position: 'ST' },
      ],
    },
    consents: ['osei', 'kaya', 'wagner', 'nowak'].map((id) => adult(id)),
    ...patch,
  }
}

const kit = {
  handle: '@svspreewiese',
  hashtags: ['#SVSpreewiese'],
  sponsors: [
    { id: 's1', name: 'Bäckerei Krause', logoUrl: null },
    { id: 's2', name: 'Treptow Autohaus', logoUrl: null },
  ],
}

function build(m: StudioMatchInput, options: Partial<StudioGraphicOptions> = {}) {
  return buildGraphicData(m, kit, {
    template: 'FULL_TIME',
    elements: { sponsor: true, handle: true, competition: true },
    locale: 'de-DE',
    t,
    now: new Date('2026-11-15T15:00:00.000Z'),
    ...options,
  })
}

describe('buildGraphicData: match data binding', () => {
  it('fills header, footer and score from the match record', () => {
    const data = build(match())
    expect(data.header.clubName).toBe('SV Spreewiese')
    expect(data.header.clubShort).toBe('SVS')
    expect(data.header.competition).toBe('Kreisliga C · studio.graphic.season {"season":"26/27"}')
    expect(data.footer).toEqual({ handle: '@svspreewiese', sponsor: 'Bäckerei Krause' })
    expect(data.score).toBe('3:1')
    expect(data.scorers).toBe("Osei 23' · Kaya 58' · Osei 71'")
    expect(data.matchday.kicker).toBe('studio.graphic.matchday {"number":11}')
    expect(data.matchday.venue).toBe('Sportplatz Dammweg')
  })

  it('puts the home team first, on the left, and mirrors in RTL', () => {
    const home = build(match())
    expect([home.left.short, home.right.short]).toEqual(['SVS', 'RWK'])
    const away = build(match({ homeAway: 'AWAY' }))
    expect([away.left.short, away.right.short]).toEqual(['RWK', 'SVS'])
    expect(away.score).toBe('1:3')
    expect(away.outcome).toBe('WIN')
    const rtl = build(match(), { rtl: true })
    expect([rtl.left.short, rtl.right.short]).toEqual(['RWK', 'SVS'])
    expect(rtl.score).toBe('1:3')
  })

  it.each([
    [3, 1, 'WIN', 'studio.graphic.win'],
    [2, 2, 'DRAW', 'studio.graphic.draw'],
    [0, 2, 'LOSS', 'studio.graphic.fullTime'],
  ])('%i:%i reads %s with kicker %s', (goalsFor, goalsAgainst, outcome, kicker) => {
    const data = build(match({ goalsFor, goalsAgainst }))
    expect(data.outcome).toBe(outcome)
    expect(data.kicker).toBe(kicker)
  })

  it('writes a respectful caption after a loss and never uses the win copy', () => {
    const data = build(match({ goalsFor: 0, goalsAgainst: 2, events: [] }))
    const caption = buildCaption(data, kit, t)
    expect(caption).toContain('studio.caption.loss.a')
    expect(caption).not.toContain('studio.caption.win')
    expect(caption).toContain('#SVSpreewiese')
  })

  it('hides the scorers line and disables Tor at 0 own goals', () => {
    const data = build(match({ goalsFor: 0, goalsAgainst: 0, events: [] }))
    expect(data.scorers).toBeNull()
    expect(data.goal).toBeNull()
    expect(data.disabled).toContain('GOAL')
    expect(resolveTemplate('GOAL', data)).toBe('FULL_TIME')
    expect(resolveTemplate('LINEUP', data)).toBe('LINEUP')
  })

  it('shows an opponent own goal as "Eigentor"', () => {
    const data = build(
      match({ goalsFor: 1, goalsAgainst: 0, events: [goal('og', 40, null, null, { ownGoal: true })] }),
    )
    expect(data.scorers).toBe("studio.graphic.ownGoal 40'")
    expect(data.goal?.scorer).toBe("studio.graphic.ownGoal 40'")
  })

  it('labels abandoned and cancelled matches', () => {
    expect(build(match({ state: 'ABANDONED' })).kicker).toBe('studio.graphic.abandoned')
    expect(build(match({ state: 'ABANDONED' })).outcome).toBeNull()
    expect(build(match({ state: 'CANCELLED' })).kicker).toBe('studio.graphic.cancelled')
  })

  it('shows a shoot-out as "n.E." and lets it decide the outcome', () => {
    const data = build(match({ goalsFor: 1, goalsAgainst: 1, shootout: { goalsFor: 5, goalsAgainst: 4 } }))
    expect(data.score).toBe('1:1')
    expect(data.shootout).toBe('studio.graphic.shootout {"score":"5:4"}')
    expect(data.outcome).toBe('WIN')
    expect(data.kicker).toBe('studio.graphic.win')
  })

  it('uses the break score for Halbzeit once the second half runs', () => {
    const data = build(match(), { template: 'HALF_TIME' })
    expect(data.kicker).toBe('studio.graphic.halfTime')
    expect(data.score).toBe('1:0')
    expect(data.scorers).toBe("Osei 23'")
  })

  it('Tor shows the latest scorer and the score at that moment', () => {
    const data = build(match(), { template: 'GOAL' })
    expect(data.goal).toEqual({
      headline: 'studio.graphic.goal',
      ghost: 'studio.graphic.goalGhost',
      scorer: "Kofi Osei 71'",
      chip: 'SVS 3:1 RWK',
    })
  })

  it('applies a typed score to this graphic only', () => {
    const source = match()
    const data = build(source, { scoreOverride: { goalsFor: 1, goalsAgainst: 4 } })
    expect(data.score).toBe('1:4')
    expect(data.outcome).toBe('LOSS')
    expect(data.scorers).toBe("Osei 23'")
    expect(source.goalsFor).toBe(3)
  })

  it('switches sponsor, handle and competition off', () => {
    const data = build(match(), { elements: { sponsor: false, handle: false, competition: false } })
    expect(data.footer).toEqual({ handle: null, sponsor: null })
    expect(data.header.competition).toBeNull()
  })

  it('groups the lineup by position', () => {
    const rows = build(match(), { template: 'LINEUP' }).lineup.rows
    expect(rows.map((r) => r.names)).toEqual(['Wagner', 'Nowak', 'Kaya', 'Osei'])
    expect(rows[0].label).toBe('studio.graphic.position.gk')
  })

  it('renders without a match (real server, nothing scheduled)', () => {
    const data = build(match({ opponent: null, date: null, events: [], lineup: null, goalsFor: 0, goalsAgainst: 0, hasLiveData: false, state: 'SCHEDULED', competition: null }))
    expect(data.right.name).toBe('studio.graphic.opponentFallback')
    expect(data.lineup.rows).toEqual([])
    expect(data.matchday.date).toBe('studio.graphic.dateOpen')
  })
})

describe('buildGraphicData: consent (blocking rules)', () => {
  it('names a player only when they have not opted out of public naming', () => {
    const data = build(match({ consents: [adult('osei', { publicNaming: false }), adult('kaya')] }))
    expect(data.scorers).toBe("23' · Kaya 58' · 71'")
    expect(JSON.stringify(data)).not.toContain('Osei')
  })

  it('fails closed for players the consent list does not know', () => {
    const data = build(match({ consents: [] }), { template: 'LINEUP' })
    expect(data.scorers).toBe("23' · 58' · 71'")
    expect(data.motm).toBeNull()
    expect(data.disabled).toContain('PLAYER_OF_THE_MATCH')
    // The shirt number stands in for the name.
    expect(data.lineup.rows[0].names).toBe('studio.graphic.shirt {"number":1}')
    expect(JSON.stringify(data)).not.toMatch(/Osei|Kaya|Wagner|Nowak/)
  })

  it('never names a guest player without an account', () => {
    const data = build(match({ goalsFor: 1, events: [goal('g', 12, null, 'Gastspieler Max')] }))
    expect(data.scorers).toBe("12'")
  })

  it('needs parental consent to name a minor', () => {
    const minor = (parentalConsent: StudioPlayerConsent['parentalConsent']) =>
      build(match({ consents: [adult('osei', { isMinor: true, parentalConsent }), adult('kaya')] }))
    expect(minor(null).scorers).toBe("23' · Kaya 58' · 71'")
    expect(minor({ photo: true, name: false }).scorers).toBe("23' · Kaya 58' · 71'")
    expect(minor({ photo: false, name: true }).scorers).toBe("Osei 23' · Kaya 58' · Osei 71'")
  })

  it('never places a photo without photo consent', () => {
    const withPhoto = build(match(), { template: 'PLAYER_OF_THE_MATCH' })
    expect(withPhoto.motm?.lines).toEqual(['Kofi', 'Osei'])
    expect(withPhoto.motm?.photoUrl).toBe('https://cdn.test/osei.png')
    const noPhoto = build(match({ consents: [adult('osei', { photoConsent: false }), adult('kaya')] }), {
      template: 'PLAYER_OF_THE_MATCH',
    })
    expect(noPhoto.motm?.lines).toEqual(['Kofi', 'Osei'])
    expect(noPhoto.motm?.photoUrl).toBeNull()
    const minorNoParent = build(
      match({ consents: [adult('osei', { isMinor: true, parentalConsent: { photo: false, name: true } }), adult('kaya')] }),
      { template: 'PLAYER_OF_THE_MATCH' },
    )
    expect(minorNoParent.motm?.photoUrl).toBeNull()
  })

  it('exposes the two consent predicates', () => {
    expect(canUsePlayerName(null)).toBe(false)
    expect(canUsePlayerPhoto(undefined)).toBe(false)
    expect(canUsePlayerName(adult('a'))).toBe(true)
    expect(canUsePlayerPhoto(adult('a', { isMinor: true, parentalConsent: { photo: true, name: false } }))).toBe(true)
    expect(canUsePlayerName(adult('a', { isMinor: true, parentalConsent: { photo: true, name: false } }))).toBe(false)
  })
})

describe('helpers', () => {
  it('derives short codes and seasons', () => {
    expect(studioShortCode('SV Spreewiese 1921')).toBe('SVS')
    expect(studioShortCode('Rot-Weiß Köpenick III')).toBe('RWK')
    expect(studioShortCode('Hertha')).toBe('HER')
    expect(studioSeason(new Date('2026-11-15'))).toBe('26/27')
    expect(studioSeason(new Date('2027-03-01'))).toBe('26/27')
  })
})

describe('"Jetzt dran" suggestion', () => {
  const now = new Date('2026-11-15T15:00:00.000Z')
  it('suggests nothing before kickoff', () => {
    expect(buildSuggestion(match({ state: 'SCHEDULED', hasLiveData: false }), {}, t, now)).toBeNull()
    expect(buildSuggestion(null, {}, t, now)).toBeNull()
  })
  it('suggests the lineup after kickoff, the goal right after a goal', () => {
    const running = match({ state: 'FIRST_HALF', goalsFor: 0, goalsAgainst: 0, events: [] })
    expect(buildSuggestion(running, {}, t, now)?.template).toBe('LINEUP')
    expect(buildSuggestion({ ...running, lineup: null }, {}, t, now)?.template).toBe('MATCHDAY')
    const fresh = match({
      state: 'FIRST_HALF',
      goalsFor: 1,
      goalsAgainst: 0,
      events: [goal('g', 23, 'osei', 'Kofi Osei', { createdAt: '2026-11-15T14:57:00.000Z' })],
    })
    expect(buildSuggestion(fresh, {}, t, now)?.template).toBe('GOAL')
  })
  it('suggests Halbzeit at the break and Endstand after the whistle', () => {
    expect(buildSuggestion(match({ state: 'HALF_TIME' }), {}, t, now)?.template).toBe('HALF_TIME')
    const done = buildSuggestion(match(), { finishedAt: '2026-11-15T14:48:00.000Z' }, t, now)
    expect(done?.template).toBe('FULL_TIME')
    expect(done?.title).toBe('studio.suggest.fullTimeTitle {"score":"3:1"}')
    expect(done?.body).toContain('studio.suggest.fullTimeAgo {"count":12}')
    expect(buildSuggestion(match(), { finishedAt: '2026-11-13T14:48:00.000Z' }, t, now)).toBeNull()
  })
})

describe('Studio access', () => {
  it.each([
    [{ role: 'OWNER', operationalRoles: [] }, null, true],
    [{ role: 'PLAYER', operationalRoles: ['MEDIA_MANAGER'] }, null, true],
    [{ role: 'PLAYER', operationalRoles: ['CAPTAIN'] }, null, true],
    [{ role: 'PLAYER', operationalRoles: ['TEAM_COORDINATOR'] }, null, true],
    [{ role: 'COACH', operationalRoles: [] }, { role: 'HEAD_COACH' }, true],
    [{ role: 'PLAYER', operationalRoles: ['TREASURER'] }, { role: 'PLAYER' }, false],
    [{ role: 'PARENT', operationalRoles: [] }, { role: 'PARENT' }, false],
    [null, null, false],
  ])('canUseStudio(%j, %j) = %s', (membership, access, expected) => {
    expect(canUseStudio(membership, access)).toBe(expected)
  })
  it('lets Vorstand, Kassenwart and Medienwart buy credits', () => {
    expect(canBuyStudioCredits({ role: 'ADMIN', operationalRoles: [] })).toBe(true)
    expect(canBuyStudioCredits({ role: 'PLAYER', operationalRoles: ['TREASURER'] })).toBe(true)
    expect(canBuyStudioCredits({ role: 'PLAYER', operationalRoles: ['MEDIA_MANAGER'] })).toBe(true)
    expect(canBuyStudioCredits({ role: 'COACH', operationalRoles: ['CAPTAIN'] })).toBe(false)
  })
})
