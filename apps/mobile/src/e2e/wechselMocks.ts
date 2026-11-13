/**
 * E2E mocks for the Wechselbörse (Gesuche, Spielersuche, Probetraining,
 * Aufnahmeantrag, Vereinswechsel) and the free agent's profile.
 *
 * State lives in this module and is re-seeded whenever the persona changes,
 * so every Maestro run starts from the same realistic German data:
 * SV Albatros "Herren II sucht Torwart" (Kreisliga A), free agents like
 * Amir Kaya (Mittelfeld, rechts, Bezirksliga), trials in every stage.
 */
import type {
  FreeAgentListItem,
  FreeAgentProfile,
  PlayerSearch,
  TrialInvite,
  TrialJoinRequestSummary,
  TrialSession,
} from '@anstoss/shared'

type Response =
  | { handled: false }
  | { handled: true; ok: boolean; status: number; body?: unknown; message?: string }

export type WechselMockContext = {
  scenario: string
  pathname: string
  method: string
  query: URLSearchParams | null
  body: unknown
  user: { id: string; name: string; dateOfBirth?: string | null; avatarUrl?: string | null }
  club: { id: string; name: string; primaryColor: string; teamId: string; teamName: string }
  getProfile: () => FreeAgentProfile | null
  setProfile: (profile: FreeAgentProfile | null) => void
}

function at(days: number, hour = 19, minute = 0) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

function dateOnly(days: number) {
  return at(days, 12).slice(0, 10)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function ok(body: unknown, status = 200): Response {
  return { handled: true, ok: true, status, body: clone(body) }
}

function fail(status: number, message: string): Response {
  return { handled: true, ok: false, status, message }
}

function ageFrom(birth: string) {
  const dob = new Date(birth)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1
  return age
}

// ─── Clubs & teams ────────────────────────────────────────────────────

const OTHER_CLUBS = {
  babelsberg: { id: 'club-e2e-babelsberg', name: 'SV Babelsberg 03', badgeUrl: null, primaryColor: '#1C2F6B', city: 'Potsdam' },
  teltow: { id: 'club-e2e-teltow', name: 'Teltower FV 1913', badgeUrl: null, primaryColor: '#B3122E', city: 'Teltow' },
  glindow: { id: 'club-e2e-glindow', name: 'FSV Eintracht Glindow', badgeUrl: null, primaryColor: '#0F6B3A', city: 'Werder (Havel)' },
  werder: { id: 'club-e2e-werder', name: 'SV Werder 1919', badgeUrl: null, primaryColor: '#2B5FA8', city: 'Werder (Havel)' },
}

// ─── Free agents (Spielersuche) ───────────────────────────────────────

type AgentSeed = {
  id: string
  userId: string
  name: string
  birth: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  foot: 'LEFT' | 'RIGHT' | 'BOTH'
  league: string
  currentClub: string | null
  postalCode: string
  city: string
  availableFrom: string | null
  bio: string
  experience: Array<{ clubName: string; roleLabel: string; fromYear: number; toYear: number | null }>
}

function nextJan1() {
  const now = new Date()
  return `${now.getFullYear() + 1}-01-01`
}

function nextJul1() {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-07-01`
}

function agentSeeds(): AgentSeed[] {
  return [
    {
      id: 'free-agent-profile-1',
      userId: 'free-agent-1',
      name: 'Amir Kaya',
      birth: '2001-03-14',
      position: 'MID',
      foot: 'RIGHT',
      league: 'BEZIRKSLIGA',
      currentClub: null,
      postalCode: '14482',
      city: 'Potsdam',
      availableFrom: null,
      bio: 'Spielstarker Sechser, zwei Jahre Bezirksliga beim SV Babelsberg 03 II. Nach dem Umzug nach Potsdam suche ich ein ehrgeiziges Team.',
      experience: [
        { clubName: 'SV Babelsberg 03 II', roleLabel: 'Zentrales Mittelfeld', fromYear: 2022, toYear: 2025 },
        { clubName: 'TSV Linden', roleLabel: 'A-Jugend', fromYear: 2018, toYear: 2020 },
      ],
    },
    {
      id: 'fa-jonas-albrecht',
      userId: 'user-fa-jonas',
      name: 'Jonas Albrecht',
      birth: '1998-08-02',
      position: 'GK',
      foot: 'RIGHT',
      league: 'KREISLIGA_A',
      currentClub: 'FC Stahl Brandenburg II',
      postalCode: '14770',
      city: 'Brandenburg an der Havel',
      availableFrom: nextJan1(),
      bio: 'Torwart mit gutem Spielaufbau. Wechsel zur Winterpause möglich.',
      experience: [{ clubName: 'FC Stahl Brandenburg II', roleLabel: 'Torwart', fromYear: 2019, toYear: null }],
    },
    {
      id: 'fa-luca-brandt',
      userId: 'user-fa-luca',
      name: 'Luca Brandt',
      birth: '2008-11-20',
      position: 'FWD',
      foot: 'LEFT',
      league: 'YOUTH',
      currentClub: 'SG Bornim',
      postalCode: '14469',
      city: 'Potsdam',
      availableFrom: null,
      bio: 'Schneller Linksfuß aus der A-Jugend, will in den Herrenbereich.',
      experience: [{ clubName: 'SG Bornim', roleLabel: 'A-Jugend', fromYear: 2020, toYear: null }],
    },
    {
      id: 'fa-emre-yildiz',
      userId: 'user-fa-emre',
      name: 'Emre Yıldız',
      birth: '2003-01-09',
      position: 'DEF',
      foot: 'BOTH',
      league: 'LANDESLIGA',
      currentClub: null,
      postalCode: '14471',
      city: 'Potsdam',
      availableFrom: null,
      bio: 'Innenverteidiger, kopfballstark, zuletzt Landesliga.',
      experience: [{ clubName: 'Brandenburger SC Süd 05', roleLabel: 'Innenverteidiger', fromYear: 2021, toYear: 2025 }],
    },
    {
      id: 'fa-tobias-neumann',
      userId: 'user-fa-tobias',
      name: 'Tobias Neumann',
      birth: '1994-06-30',
      position: 'DEF',
      foot: 'RIGHT',
      league: 'KREISLIGA_B',
      currentClub: 'Teltower FV 1913',
      postalCode: '14513',
      city: 'Teltow',
      availableFrom: nextJul1(),
      bio: 'Rechtsverteidiger mit viel Erfahrung, sucht zur neuen Saison etwas Neues.',
      experience: [{ clubName: 'Teltower FV 1913', roleLabel: 'Rechtsverteidiger', fromYear: 2016, toYear: null }],
    },
    {
      id: 'fa-marco-rossi',
      userId: 'user-fa-marco',
      name: 'Marco Rossi',
      birth: '1999-10-11',
      position: 'MID',
      foot: 'LEFT',
      league: 'OBERLIGA',
      currentClub: null,
      postalCode: '14467',
      city: 'Potsdam',
      availableFrom: null,
      bio: 'Linker Achter, Oberliga-Erfahrung, will kürzertreten und in der Nähe spielen.',
      experience: [{ clubName: 'SV Babelsberg 03', roleLabel: 'Mittelfeld', fromYear: 2019, toYear: 2024 }],
    },
    {
      id: 'fa-felix-wagner',
      userId: 'user-fa-felix',
      name: 'Felix Wagner',
      birth: '2006-04-02',
      position: 'FWD',
      foot: 'RIGHT',
      league: 'KREISLIGA_A',
      currentClub: 'SV Werder 1919',
      postalCode: '14542',
      city: 'Werder (Havel)',
      availableFrom: null,
      bio: 'Mittelstürmer, 14 Tore in der letzten Saison.',
      experience: [{ clubName: 'SV Werder 1919', roleLabel: 'Sturm', fromYear: 2023, toYear: null }],
    },
    {
      id: 'fa-niklas-schulz',
      userId: 'user-fa-niklas',
      name: 'Niklas Schulz',
      birth: '1996-02-17',
      position: 'GK',
      foot: 'LEFT',
      league: 'BEZIRKSLIGA',
      currentClub: null,
      postalCode: '14480',
      city: 'Potsdam',
      availableFrom: null,
      bio: 'Fünf Jahre Bezirksliga im Tor, zuletzt verletzt, jetzt wieder fit.',
      experience: [{ clubName: 'Potsdamer Kickers 94', roleLabel: 'Torwart', fromYear: 2018, toYear: 2023 }],
    },
  ]
}

function toProfile(seed: AgentSeed): FreeAgentProfile {
  return {
    id: seed.id,
    userId: seed.userId,
    position: seed.position as FreeAgentProfile['position'],
    preferredFoot: seed.foot as FreeAgentProfile['preferredFoot'],
    city: seed.city,
    bio: seed.bio,
    avatarUrl: null,
    isOnTransferList: true,
    visibility: 'CLUB_ONLY' as FreeAgentProfile['visibility'],
    postalCode: seed.postalCode,
    postalRegion: seed.postalCode ? seed.postalCode.slice(0, 2) : null,
    searchRadiusKm: 25,
    highestLeague: seed.league,
    currentClubName: seed.currentClub,
    availableFrom: seed.availableFrom,
    age: ageFrom(seed.birth),
    isMinor: ageFrom(seed.birth) < 18,
    experience: seed.experience.map((entry, index) => ({
      id: `${seed.id}-exp-${index}`,
      clubName: entry.clubName,
      roleLabel: entry.roleLabel,
      fromYear: entry.fromYear,
      toYear: entry.toYear,
      sortOrder: index,
    })),
    media: [],
    createdAt: at(-20),
    updatedAt: at(-2),
    user: { id: seed.userId, name: seed.name, avatarUrl: null },
  }
}

function toListItem(profile: FreeAgentProfile): FreeAgentListItem {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    avatarUrl: profile.avatarUrl,
    position: profile.position,
    preferredFoot: profile.preferredFoot,
    city: profile.city,
    experienceCount: profile.experience.length,
    visibility: profile.visibility,
    // Like the API: the PLZ stays with its owner; lists carry the region.
    postalCode: null,
    postalRegion: profile.postalRegion,
    highestLeague: profile.highestLeague,
    currentClubName: profile.currentClubName,
    availableFrom: profile.availableFrom,
    age: profile.isMinor ? null : profile.age,
    isMinor: profile.isMinor,
    createdAt: profile.createdAt,
    // Redesign 22: a stable 1–9 km distance per PLZ for the preview.
    distanceKm: profile.postalCode ? (Number(profile.postalCode.slice(-2)) % 9) + 1 : null,
  }
}

// ─── Trials ───────────────────────────────────────────────────────────

type ClubInfo = { id: string; name: string; badgeUrl: string | null; primaryColor: string }

function session(id: string, days: number, hour = 19, location = 'Kunstrasen, Sportpark Albatros'): TrialSession {
  return { id, title: 'Training', date: at(days, hour), location, cancelledAt: null }
}

function buildInvite(input: {
  id: string
  club: ClubInfo
  team: { id: string; displayName: string; leagueName: string | null }
  player: FreeAgentProfile
  status: TrialInvite['status']
  initiatedBy?: 'CLUB' | 'PLAYER'
  sessions?: TrialSession[]
  createdDays: number
  expiresDays?: number
  message?: string | null
  sender?: { id: string; name: string }
  rating?: number | null
  feedback?: string | null
  attended?: boolean | null
  respondedDays?: number | null
  decidedDays?: number | null
  decisionMessage?: string | null
  playerSearchId?: string | null
  joinRequest?: TrialJoinRequestSummary | null
}): TrialInvite {
  const sessions = input.sessions ?? []
  return {
    id: input.id,
    clubId: input.club.id,
    freeAgentProfileId: input.player.id,
    teamId: input.team.id,
    sentByUserId: input.sender?.id ?? 'user-e2e-coach',
    message: input.message ?? null,
    expiresAt: at(input.expiresDays ?? 10),
    status: input.status,
    respondedAt: input.respondedDays != null ? at(input.respondedDays, 10) : null,
    createdAt: at(input.createdDays, 9),
    initiatedBy: (input.initiatedBy ?? 'CLUB') as TrialInvite['initiatedBy'],
    playerSearchId: input.playerSearchId ?? null,
    sessionEventIds: sessions.map((entry) => entry.id),
    sessions,
    feedback: input.feedback ?? null,
    rating: input.rating ?? null,
    attended: input.attended ?? null,
    decisionMessage: input.decisionMessage ?? null,
    decidedAt: input.decidedDays != null ? at(input.decidedDays, 20) : null,
    club: { id: input.club.id, name: input.club.name, badgeUrl: input.club.badgeUrl, primaryColor: input.club.primaryColor },
    team: { id: input.team.id, displayName: input.team.displayName, groupName: 'Herren', leagueName: input.team.leagueName },
    sender: input.sender ?? { id: 'user-e2e-coach', name: 'Mara Schulz' },
    player: {
      profileId: input.player.id,
      userId: input.player.userId,
      name: input.player.user.name,
      avatarUrl: input.player.avatarUrl,
      position: input.player.position,
      preferredFoot: input.player.preferredFoot,
      highestLeague: input.player.highestLeague,
      age: input.player.isMinor ? null : input.player.age,
      isMinor: input.player.isMinor,
    },
    joinRequest: input.joinRequest ?? null,
  }
}

// ─── State ────────────────────────────────────────────────────────────

type State = {
  key: string
  agents: FreeAgentProfile[]
  clubSearches: PlayerSearch[]
  otherSearches: PlayerSearch[]
  clubInvites: TrialInvite[]
  myInvites: TrialInvite[]
  counter: number
}

let state: State | null = null

function seed(ctx: WechselMockContext): State {
  const agents = agentSeeds().map(toProfile)
  const byId = (id: string) => agents.find((agent) => agent.id === id) as FreeAgentProfile
  const albatros: ClubInfo = {
    id: ctx.club.id,
    name: ctx.club.name,
    badgeUrl: null,
    primaryColor: ctx.club.primaryColor,
  }
  const clubCity = 'Potsdam'
  const herren2 = { id: 'team-e2e-herren-2', displayName: 'Herren II', leagueName: 'Kreisliga A' }
  const senior = { id: ctx.club.teamId, displayName: ctx.club.teamName, leagueName: 'Bezirksliga' }

  const search = (
    id: string,
    club: ClubInfo & { city: string | null },
    team: { id: string; displayName: string; leagueName: string | null },
    positions: PlayerSearch['positions'],
    note: string,
    status: PlayerSearch['status'],
    expiresDays: number | null,
    createdDays: number,
  ): PlayerSearch => ({
    id,
    clubId: club.id,
    teamId: team.id,
    positions,
    note,
    status,
    expiresAt: expiresDays == null ? null : at(expiresDays, 23),
    createdAt: at(createdDays, 10),
    club: { id: club.id, name: club.name, badgeUrl: club.badgeUrl, primaryColor: club.primaryColor, city: club.city },
    team: { id: team.id, displayName: team.displayName, leagueName: team.leagueName, ageGroup: null },
  })

  const albatrosWithCity = { ...albatros, city: clubCity }
  const clubSearches: PlayerSearch[] = [
    search(
      'gesuch-albatros-torwart',
      albatrosWithCity,
      herren2,
      ['GK'] as PlayerSearch['positions'],
      'Herren II sucht Torwart, Kreisliga A. Unser Stammkeeper fällt mit Kreuzbandriss aus. Training Di und Do ab 19 Uhr auf dem Kunstrasen.',
      'OPEN' as PlayerSearch['status'],
      21,
      -4,
    ),
    search(
      'gesuch-albatros-iv',
      albatrosWithCity,
      senior,
      ['DEF', 'MID'] as PlayerSearch['positions'],
      'Zur Rückrunde suchen wir Verstärkung für Innenverteidigung und zentrales Mittelfeld.',
      'OPEN' as PlayerSearch['status'],
      null,
      -9,
    ),
    search(
      'gesuch-albatros-sturm',
      albatrosWithCity,
      { id: 'team-e2e-a-jugend', displayName: 'A-Jugend', leagueName: 'Landesklasse' },
      ['FWD'] as PlayerSearch['positions'],
      'Stürmer Jahrgang 2007/2008 gesucht.',
      'FILLED' as PlayerSearch['status'],
      null,
      -30,
    ),
  ].map((entry, index) => ({ ...entry, openTrialCount: index === 0 ? 1 : index === 1 ? 2 : 0 }))

  const otherSearches: PlayerSearch[] = [
    search(
      'gesuch-babelsberg-mf',
      OTHER_CLUBS.babelsberg,
      { id: 'team-babelsberg-2', displayName: 'Zweite Mannschaft', leagueName: 'Landesliga' },
      ['MID'] as PlayerSearch['positions'],
      'Wir suchen einen spielstarken Sechser. Training Mo, Mi, Fr im Karl-Liebknecht-Stadion.',
      'OPEN' as PlayerSearch['status'],
      14,
      -2,
    ),
    search(
      'gesuch-glindow-tw',
      OTHER_CLUBS.glindow,
      { id: 'team-glindow-1', displayName: '1. Herren', leagueName: 'Kreisliga B' },
      ['GK', 'FWD'] as PlayerSearch['positions'],
      'Torwart und Stürmer für eine junge, ehrgeizige Truppe gesucht. Wir trainieren Di und Do.',
      'OPEN' as PlayerSearch['status'],
      30,
      -6,
    ),
    search(
      'gesuch-teltow-iv',
      OTHER_CLUBS.teltow,
      { id: 'team-teltow-1', displayName: '1. Herren', leagueName: 'Kreisliga A' },
      ['DEF'] as PlayerSearch['positions'],
      'Innenverteidiger mit Erfahrung gesucht, gern auch zur Winterpause.',
      'OPEN' as PlayerSearch['status'],
      null,
      -12,
    ),
  ]

  const me = ctx.getProfile()
  const player = me
    ? { ...me, userId: ctx.user.id }
    : { ...byId('free-agent-profile-1'), userId: ctx.user.id }

  const clubInvites: TrialInvite[] = [
    buildInvite({
      id: 'trial-club-niklas',
      club: albatros,
      team: herren2,
      player: byId('fa-niklas-schulz'),
      status: 'REQUESTED' as TrialInvite['status'],
      initiatedBy: 'PLAYER',
      playerSearchId: 'gesuch-albatros-torwart',
      createdDays: -1,
      expiresDays: 13,
      message: 'Hallo, ich habe fünf Jahre Bezirksliga im Tor gespielt und bin wieder fit. Ich würde gern mittrainieren.',
    }),
    buildInvite({
      id: 'trial-club-jonas',
      club: albatros,
      team: herren2,
      player: byId('fa-jonas-albrecht'),
      status: 'PENDING' as TrialInvite['status'],
      sessions: [session('event-trial-herren2-1', 3), session('event-trial-herren2-2', 5)],
      createdDays: -2,
      expiresDays: 3,
      message: 'Komm gern am Dienstag vorbei, bring Handschuhe mit.',
    }),
    buildInvite({
      id: 'trial-club-emre',
      club: albatros,
      team: senior,
      player: byId('fa-emre-yildiz'),
      status: 'ACCEPTED' as TrialInvite['status'],
      sessions: [session('event-training-later', 5, 19, 'Pitch 2')],
      createdDays: -5,
      respondedDays: -4,
    }),
    buildInvite({
      id: 'trial-club-marco',
      club: albatros,
      team: senior,
      player: byId('fa-marco-rossi'),
      status: 'ACCEPTED' as TrialInvite['status'],
      sessions: [session('event-trial-past-1', -3), session('event-trial-past-2', -1)],
      createdDays: -10,
      respondedDays: -9,
      rating: 4,
      attended: true,
      feedback: 'Sehr gutes Passspiel, übernimmt Verantwortung. Konditionell noch nicht bei 100 Prozent.',
    }),
    buildInvite({
      id: 'trial-club-tobias',
      club: albatros,
      team: senior,
      player: byId('fa-tobias-neumann'),
      status: 'OFFERED' as TrialInvite['status'],
      sessions: [session('event-trial-past-3', -8)],
      createdDays: -14,
      respondedDays: -6,
      decidedDays: -6,
      rating: 5,
      attended: true,
      decisionMessage: 'Schön, dass du da warst! Wir würden dich gern bei uns sehen.',
      joinRequest: {
        id: 'join-request-tobias',
        status: 'PENDING',
        revision: 1,
        createdAt: at(-5, 18),
        previousClubName: 'Teltower FV 1913',
        releaseStatus: 'PENDING' as TrialJoinRequestSummary['releaseStatus'],
        passApplicationAt: null,
        eligibleFrom: null,
      },
    }),
    buildInvite({
      id: 'trial-club-felix',
      club: albatros,
      team: senior,
      player: byId('fa-felix-wagner'),
      status: 'JOINED' as TrialInvite['status'],
      sessions: [session('event-trial-past-4', -25)],
      createdDays: -30,
      respondedDays: -28,
      decidedDays: -20,
      rating: 4,
      attended: true,
      joinRequest: {
        id: 'join-request-felix',
        status: 'APPROVED',
        revision: 1,
        createdAt: at(-19, 18),
        previousClubName: 'SV Werder 1919',
        releaseStatus: 'GRANTED' as TrialJoinRequestSummary['releaseStatus'],
        passApplicationAt: dateOnly(-15),
        eligibleFrom: null,
      },
    }),
    buildInvite({
      id: 'trial-club-luca',
      club: albatros,
      team: senior,
      player: byId('fa-luca-brandt'),
      status: 'REJECTED' as TrialInvite['status'],
      sessions: [session('event-trial-past-5', -12)],
      createdDays: -16,
      respondedDays: -15,
      decidedDays: -11,
      rating: 2,
      attended: true,
      decisionMessage: 'Danke fürs Mitmachen! Aktuell ist nichts frei. Wenn sich etwas ändert, melden wir uns bei dir.',
    }),
  ]

  const myInvites: TrialInvite[] = [
    buildInvite({
      id: 'trial-my-albatros',
      club: albatros,
      team: senior,
      player,
      status: 'PENDING' as TrialInvite['status'],
      sessions: [session('event-training-later', 5, 19, 'Pitch 2'), session('event-trial-my-2', 7)],
      createdDays: -1,
      expiresDays: 4,
      message: 'Hallo Amir, wir suchen für die Rückrunde einen Sechser. Komm gern zum Training!',
      sender: { id: 'user-e2e-coach', name: 'Mara Schulz' },
    }),
    buildInvite({
      id: 'trial-my-babelsberg',
      club: OTHER_CLUBS.babelsberg,
      team: { id: 'team-babelsberg-2', displayName: 'Zweite Mannschaft', leagueName: 'Landesliga' },
      player,
      status: 'ACCEPTED' as TrialInvite['status'],
      sessions: [session('event-babelsberg-1', 2, 18, 'Sportplatz Sandscholle, Potsdam')],
      createdDays: -4,
      respondedDays: -3,
      sender: { id: 'user-babelsberg-coach', name: 'Lukas Hoffmann' },
      message: 'Treffpunkt 17:45 an der Kabine 3.',
    }),
    buildInvite({
      id: 'trial-my-teltow',
      club: OTHER_CLUBS.teltow,
      team: { id: 'team-teltow-1', displayName: '1. Herren', leagueName: 'Kreisliga A' },
      player,
      status: 'OFFERED' as TrialInvite['status'],
      sessions: [session('event-teltow-1', -6, 19, 'Sportplatz Mahlower Straße, Teltow')],
      createdDays: -12,
      respondedDays: -11,
      decidedDays: -1,
      sender: { id: 'user-teltow-coach', name: 'Tim Weber' },
      decisionMessage: 'Hat Spaß gemacht mit dir! Wir würden dich gern in der 1. Herren sehen.',
    }),
    buildInvite({
      id: 'trial-my-glindow',
      club: OTHER_CLUBS.glindow,
      team: { id: 'team-glindow-1', displayName: '1. Herren', leagueName: 'Kreisliga B' },
      player,
      status: 'REQUESTED' as TrialInvite['status'],
      initiatedBy: 'PLAYER',
      playerSearchId: 'gesuch-glindow-tw',
      createdDays: -2,
      expiresDays: 12,
      sender: { id: 'user-glindow-coach', name: 'Jan Krüger' },
      message: 'Ich spiele Mittelfeld, kann aber auch vorne aushelfen.',
    }),
    buildInvite({
      id: 'trial-my-werder',
      club: OTHER_CLUBS.werder,
      team: { id: 'team-werder-1', displayName: '1. Herren', leagueName: 'Kreisliga A' },
      player,
      status: 'EXPIRED' as TrialInvite['status'],
      sessions: [session('event-werder-1', -20)],
      createdDays: -28,
      expiresDays: -21,
      sender: { id: 'user-werder-coach', name: 'Sven Richter' },
    }),
  ]

  return {
    key: `${ctx.scenario}:${ctx.user.id}`,
    agents,
    clubSearches,
    otherSearches,
    clubInvites,
    myInvites,
    counter: 0,
  }
}

function getState(ctx: WechselMockContext) {
  const key = `${ctx.scenario}:${ctx.user.id}`
  if (!state || state.key !== key) state = seed(ctx)
  return state
}

/** Forget mock state (tests / persona reset). */
export function resetWechselMocks() {
  state = null
}

const OPEN = new Set(['REQUESTED', 'PENDING', 'ACCEPTED', 'OFFERED'])

function isFreeAgent(ctx: WechselMockContext) {
  return ctx.scenario === 'free-agent' || ctx.scenario === 'signup-free-agent'
}

function stripClubNotes(invite: TrialInvite): TrialInvite {
  const copy = clone(invite)
  delete copy.feedback
  delete copy.rating
  delete copy.attended
  return copy
}

function postalMatch(postal: string | null, plz: string | null, radius: number) {
  if (!plz) return true
  if (!postal) return false
  const len = radius <= 15 ? 3 : radius <= 50 ? 2 : 1
  return postal.startsWith(plz.slice(0, len))
}

const CLUB_POSTAL: Record<string, string> = {
  'club-e2e-babelsberg': '14482',
  'club-e2e-teltow': '14513',
  'club-e2e-glindow': '14542',
  'club-e2e-werder': '14542',
}

// ─── Handler ──────────────────────────────────────────────────────────

export function handleWechselMock(ctx: WechselMockContext): Response {
  const { pathname, method, query } = ctx
  const clubBase = `/clubs/${ctx.club.id}`
  const body = (ctx.body ?? {}) as Record<string, unknown>

  // Free agent's own profile. POST also creates it (onboarding).
  if (pathname === '/me/free-agent-profile') {
    if (method === 'GET') return ok(ctx.getProfile())
    // GDPR delete (review fix M4): always allowed for the owner.
    if (method === 'DELETE') {
      ctx.setProfile(null)
      return ok({ success: true })
    }
    if (method === 'POST' || method === 'PATCH') {
      const existing = ctx.getProfile()
      if (!existing && method === 'PATCH') return fail(404, 'Free agent profile not found')
      const base: FreeAgentProfile =
        existing ??
        ({
          id: `fa-${ctx.user.id}`,
          userId: ctx.user.id,
          position: null,
          preferredFoot: null,
          city: null,
          bio: null,
          avatarUrl: ctx.user.avatarUrl ?? null,
          isOnTransferList: false,
          visibility: 'PRIVATE',
          postalCode: null,
          postalRegion: null,
          searchRadiusKm: null,
          highestLeague: null,
          currentClubName: null,
          availableFrom: null,
          age: ctx.user.dateOfBirth ? ageFrom(ctx.user.dateOfBirth) : null,
          isMinor: ctx.user.dateOfBirth ? ageFrom(ctx.user.dateOfBirth) < 18 : false,
          experience: [],
          media: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: { id: ctx.user.id, name: ctx.user.name, avatarUrl: ctx.user.avatarUrl ?? null },
        } as FreeAgentProfile)
      const next: FreeAgentProfile = { ...base }
      const scalar = [
        'position',
        'preferredFoot',
        'city',
        'bio',
        'isOnTransferList',
        'visibility',
        'postalCode',
        'searchRadiusKm',
        'highestLeague',
        'currentClubName',
        'availableFrom',
      ] as const
      for (const key of scalar) {
        if (key in body) (next as unknown as Record<string, unknown>)[key] = body[key] ?? null
      }
      if (Array.isArray(body.experience)) {
        next.experience = (body.experience as Array<Record<string, unknown>>).map((entry, index) => ({
          id: `fa-exp-${Date.now()}-${index}`,
          clubName: String(entry.clubName ?? ''),
          roleLabel: String(entry.roleLabel ?? ''),
          fromYear: (entry.fromYear as number | null) ?? null,
          toYear: (entry.toYear as number | null) ?? null,
          sortOrder: index,
        }))
      }
      next.postalRegion = next.postalCode ? next.postalCode.slice(0, 2) : null
      // Like the API: 16–17-year-olds are visible to clubs only.
      if (next.isMinor && next.visibility === 'PUBLIC') {
        next.visibility = 'CLUB_ONLY' as FreeAgentProfile['visibility']
      }
      next.updatedAt = new Date().toISOString()
      ctx.setProfile(next)
      return ok(next, existing ? 200 : 201)
    }
  }

  const s = getState(ctx)

  // ── Spielersuche
  if (method === 'GET' && pathname === '/free-agents') {
    const position = query?.get('position')
    const league = query?.get('league')
    const plz = query?.get('postalCode')
    const radius = Number(query?.get('radiusKm') ?? 25)
    const text = (query?.get('query') ?? '').toLowerCase()
    const pageSize = Number(query?.get('pageSize') ?? 20)
    const items = s.agents
      .filter((agent) => agent.isOnTransferList)
      .filter((agent) => !position || agent.position === position)
      .filter((agent) => !league || agent.highestLeague === league)
      .filter((agent) => postalMatch(agent.postalCode, plz ?? null, radius))
      .filter((agent) => !text || agent.user.name.toLowerCase().includes(text))
    return ok({ items: items.slice(0, pageSize).map(toListItem), page: 1, pageSize, total: items.length })
  }
  const agentMatch = pathname.match(/^\/free-agents\/([^/]+)$/)
  if (method === 'GET' && agentMatch) {
    const agent = s.agents.find((entry) => entry.id === agentMatch[1])
    return agent
      ? ok({
          ...agent,
          postalCode: null,
          age: agent.isMinor ? null : agent.age,
          media: agent.isMinor ? [] : agent.media,
        })
      : fail(404, 'Free agent profile not found')
  }

  // ── Gesuche (club)
  if (pathname === `${clubBase}/player-searches`) {
    if (method === 'GET') return ok(s.clubSearches)
    if (method === 'POST') {
      s.counter += 1
      const teamId = String(body.teamId ?? ctx.club.teamId)
      const created: PlayerSearch = {
        id: `gesuch-e2e-${s.counter}`,
        clubId: ctx.club.id,
        teamId,
        positions: (body.positions as PlayerSearch['positions']) ?? [],
        note: (body.note as string) ?? null,
        status: 'OPEN' as PlayerSearch['status'],
        expiresAt: body.expiresAt ? `${String(body.expiresAt)}T23:59:59.999Z` : null,
        createdAt: new Date().toISOString(),
        club: { id: ctx.club.id, name: ctx.club.name, badgeUrl: null, primaryColor: ctx.club.primaryColor, city: 'Potsdam' },
        team: {
          id: teamId,
          displayName: teamId === ctx.club.teamId ? ctx.club.teamName : 'Herren II',
          leagueName: teamId === ctx.club.teamId ? 'Bezirksliga' : 'Kreisliga A',
          ageGroup: null,
        },
        openTrialCount: 0,
      }
      s.clubSearches.unshift(created)
      return ok(created, 201)
    }
  }
  const searchPatch = pathname.match(new RegExp(`^${clubBase}/player-searches/([^/]+)$`))
  if (method === 'PATCH' && searchPatch) {
    const target = s.clubSearches.find((entry) => entry.id === searchPatch[1])
    if (!target) return fail(404, 'Player search not found')
    if (body.status) target.status = body.status as PlayerSearch['status']
    if ('note' in body) target.note = (body.note as string) ?? null
    return ok(target)
  }

  // ── Gesuche (free agents)
  if (method === 'GET' && pathname === '/player-searches') {
    const position = query?.get('position')
    const plz = query?.get('postalCode')
    const radius = Number(query?.get('radiusKm') ?? 25)
    const all = [...s.clubSearches.map((entry) => ({ ...entry, openTrialCount: undefined })), ...s.otherSearches]
      .filter((entry) => entry.status === 'OPEN')
      .filter((entry) => !position || entry.positions.includes(position as PlayerSearch['positions'][number]))
      .filter((entry) => postalMatch(CLUB_POSTAL[entry.clubId] ?? '14482', plz ?? null, radius))
      .map((entry) => {
        const mine = s.myInvites.find((invite) => invite.clubId === entry.clubId && OPEN.has(invite.status))
        return { ...entry, myTrialInviteId: mine?.id ?? null }
      })
    return ok({ items: all, page: 1, pageSize: 30, total: all.length })
  }
  const requestMatch = pathname.match(/^\/player-searches\/([^/]+)\/trial-requests$/)
  if (method === 'POST' && requestMatch) {
    const target = [...s.otherSearches, ...s.clubSearches].find((entry) => entry.id === requestMatch[1])
    if (!target) return fail(404, 'This search is no longer open')
    if (s.myInvites.some((invite) => invite.clubId === target.clubId && OPEN.has(invite.status))) {
      return fail(400, 'You already have an open trial with this club')
    }
    const me = ctx.getProfile()
    if (!me) return fail(400, 'Create your player profile before asking for a trial')
    s.counter += 1
    const created = buildInvite({
      id: `trial-e2e-${s.counter}`,
      club: { id: target.club.id, name: target.club.name, badgeUrl: target.club.badgeUrl, primaryColor: target.club.primaryColor },
      team: { id: target.team.id, displayName: target.team.displayName, leagueName: target.team.leagueName },
      player: { ...me, userId: ctx.user.id },
      status: 'REQUESTED' as TrialInvite['status'],
      initiatedBy: 'PLAYER',
      playerSearchId: target.id,
      createdDays: 0,
      expiresDays: 14,
      message: (body.message as string) ?? null,
    })
    s.myInvites.unshift(created)
    return ok(stripClubNotes(created), 201)
  }

  // ── Probetraining (club)
  if (pathname === `${clubBase}/trial-invites`) {
    if (method === 'GET') return ok(s.clubInvites)
    if (method === 'POST') {
      const agent = s.agents.find((entry) => entry.id === body.freeAgentProfileId)
      if (!agent) return fail(404, 'Free agent profile not found')
      if (s.clubInvites.some((invite) => invite.freeAgentProfileId === agent.id && OPEN.has(invite.status))) {
        return fail(400, 'This player already has an open trial with this club')
      }
      s.counter += 1
      const ids = (body.sessionEventIds as string[]) ?? []
      const created = buildInvite({
        id: `trial-e2e-${s.counter}`,
        club: { id: ctx.club.id, name: ctx.club.name, badgeUrl: null, primaryColor: ctx.club.primaryColor },
        team: {
          id: String(body.teamId ?? ctx.club.teamId),
          displayName: body.teamId === 'team-e2e-herren-2' ? 'Herren II' : ctx.club.teamName,
          leagueName: body.teamId === 'team-e2e-herren-2' ? 'Kreisliga A' : 'Bezirksliga',
        },
        player: agent,
        status: 'PENDING' as TrialInvite['status'],
        sessions: ids.map((id, index) => session(id, 3 + index * 2)),
        createdDays: 0,
        expiresDays: 3,
        message: (body.message as string) ?? null,
      })
      s.clubInvites.unshift(created)
      return ok(created, 201)
    }
  }
  const clubAction = pathname.match(new RegExp(`^${clubBase}/trial-invites/([^/]+)$`))
  if (method === 'PATCH' && clubAction) {
    const invite = s.clubInvites.find((entry) => entry.id === clubAction[1])
    if (!invite) return fail(404, 'Trial invite not found')
    const action = body.action
    const now = new Date().toISOString()
    if (action === 'invite') {
      const ids = (body.sessionEventIds as string[]) ?? []
      invite.status = 'PENDING' as TrialInvite['status']
      invite.sessions = ids.map((id, index) => session(id, 3 + index * 2))
      invite.sessionEventIds = ids
      invite.expiresAt = at(3)
      if (typeof body.message === 'string') invite.message = body.message
    } else if (action === 'feedback') {
      invite.rating = (body.rating as number) ?? null
      invite.feedback = (body.feedback as string) ?? null
      if (typeof body.attended === 'boolean') invite.attended = body.attended
    } else if (action === 'offer') {
      invite.status = 'OFFERED' as TrialInvite['status']
      invite.decidedAt = now
      invite.decisionMessage = (body.message as string) ?? null
    } else if (action === 'reject') {
      invite.status = 'REJECTED' as TrialInvite['status']
      invite.decidedAt = now
      invite.decisionMessage = (body.message as string) ?? null
    } else if (action === 'revoke') {
      invite.status = 'REVOKED' as TrialInvite['status']
      invite.decidedAt = now
    } else {
      return fail(400, 'Unknown trial action')
    }
    return ok(invite)
  }

  // ── Probetraining (player) + shared detail
  if (method === 'GET' && pathname === '/me/trial-invites') {
    return ok(isFreeAgent(ctx) ? s.myInvites.map(stripClubNotes) : [])
  }
  const trialMatch = pathname.match(/^\/trial-invites\/([^/]+)$/)
  if (trialMatch) {
    const mine = s.myInvites.find((entry) => entry.id === trialMatch[1])
    const clubs = s.clubInvites.find((entry) => entry.id === trialMatch[1])
    if (method === 'GET') {
      if (mine && isFreeAgent(ctx)) return ok(stripClubNotes(mine))
      if (clubs && !isFreeAgent(ctx)) return ok(clubs)
      return fail(404, 'Trial invite not found')
    }
    if (method === 'PATCH') {
      if (!mine) return fail(404, 'Trial invite not found')
      const status = body.status
      const now = new Date().toISOString()
      if (status === 'ACCEPTED' && mine.status === 'PENDING') {
        mine.status = 'ACCEPTED' as TrialInvite['status']
      } else if (status === 'DECLINED' && (mine.status === 'PENDING' || mine.status === 'OFFERED')) {
        mine.status = 'DECLINED' as TrialInvite['status']
      } else if (status === 'WITHDRAWN' && ['REQUESTED', 'PENDING', 'ACCEPTED'].includes(mine.status)) {
        mine.status = 'WITHDRAWN' as TrialInvite['status']
      } else if (status === 'ACCEPT_OFFER' && mine.status === 'OFFERED') {
        // stays OFFERED; the answer is recorded
      } else {
        return fail(400, 'Trial invite has already been handled')
      }
      mine.respondedAt = now
      return ok(stripClubNotes(mine))
    }
  }

  // ── Aufnahmeantrag + Wechsel
  const joinMatch = pathname.match(/^\/clubs\/([^/]+)\/join-requests$/)
  if (method === 'POST' && joinMatch && typeof body.trialInviteId === 'string') {
    const invite = s.myInvites.find((entry) => entry.id === body.trialInviteId)
    if (!invite || invite.status !== 'OFFERED' || invite.clubId !== joinMatch[1]) {
      return fail(400, 'This offer is no longer open')
    }
    if (!body.sepaConsent) return fail(400, 'Consent to the SEPA direct debit is required')
    s.counter += 1
    invite.joinRequest = {
      id: `join-request-e2e-${s.counter}`,
      status: 'PENDING',
      revision: 1,
      createdAt: new Date().toISOString(),
      previousClubName: (body.previousClubName as string) ?? null,
      releaseStatus: (body.previousClubName ? 'PENDING' : 'NOT_NEEDED') as TrialJoinRequestSummary['releaseStatus'],
      passApplicationAt: null,
      eligibleFrom: null,
    }
    return ok({ id: invite.joinRequest.id, status: 'PENDING' }, 201)
  }
  const wechselMatch = pathname.match(new RegExp(`^${clubBase}/join-requests/([^/]+)/wechsel$`))
  if (method === 'PATCH' && wechselMatch) {
    const invite = s.clubInvites.find((entry) => entry.joinRequest?.id === wechselMatch[1])
    if (!invite?.joinRequest) return fail(404, 'Join request not found')
    const request = invite.joinRequest
    if (body.releaseStatus) request.releaseStatus = body.releaseStatus as TrialJoinRequestSummary['releaseStatus']
    if ('passApplicationAt' in body) request.passApplicationAt = (body.passApplicationAt as string) ?? null
    if ('eligibleFrom' in body) request.eligibleFrom = (body.eligibleFrom as string) ?? null
    return ok(request)
  }

  return { handled: false }
}

