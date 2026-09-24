import type { RosterOpsMemberSummary, RosterOpsSnapshot } from '@anstoss/shared'
import {
  availabilityOf,
  buildKader,
  canMessageMember,
  endOfDayIso,
  groupKader,
  jerseyHolders,
  pendingDutyCount,
  positionLine,
  showSelfPin,
} from '../squadModel'
import { resolveIsTeamCoach } from '../useIsTeamCoach'
import { isOwnTableRow, ownTeamNameOf } from '../fixtureSide'

const NOW = new Date('2026-09-24T12:00:00.000Z')

function member(
  userId: string,
  overrides: Record<string, unknown> = {},
): RosterOpsMemberSummary {
  return {
    id: `access-${userId}`,
    userId,
    name: `Spieler ${userId}`,
    avatarUrl: null,
    role: 'PLAYER',
    phase: 'FULL',
    status: 'ACTIVE',
    position: null,
    jerseyNumber: null,
    operationalStatus: 'ACTIVE',
    absence: 'NONE',
    absenceUntil: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    loanedFromTeamId: null,
    loanedFromTeamName: null,
    ...overrides,
  } as RosterOpsMemberSummary
}

function snapshot(overrides: Partial<RosterOpsSnapshot> = {}): RosterOpsSnapshot {
  return {
    team: { id: 'team-1', displayName: 'Herren 1', squadTarget: 18 },
    squadCount: 5,
    squad: [
      member('coach', { role: 'HEAD_COACH', name: 'Coach Albrecht' }),
      member('tw', { position: 'TW', jerseyNumber: 1, name: 'Julian Becker' }),
      member('iv', { position: 'IV', jerseyNumber: 5, name: 'Lukas Hoffmann' }),
      member('zm', {
        position: 'ZM',
        jerseyNumber: 8,
        absence: 'SUSPENDED',
        absenceUntil: '2026-10-04T21:59:00.000Z',
      }),
      member('st', { position: 'ST', jerseyNumber: 9, absence: 'AWAY', absenceUntil: null }),
    ],
    operations: {
      trials: [member('trial', { phase: 'TRIAL', status: 'PENDING' })],
      newPlayers: [member('neu', { operationalStatus: 'NEW_PLAYER', jerseyNumber: 20 })],
      inactive: [member('weg', { operationalStatus: 'INACTIVE' })],
      pendingCoaches: [],
    },
    medic: {
      active: [
        {
          id: 'injury-1',
          clubId: 'club-1',
          teamId: 'team-1',
          userId: 'iv',
          reportedById: 'coach',
          title: 'Muskelfaserriss',
          notes: null,
          status: 'OUT',
          expectedReturnAt: '2026-10-15T21:59:00.000Z',
          expectedReturnLabel: null,
          clearedAt: null,
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T10:00:00.000Z',
        },
      ],
      recentlyCleared: [],
    },
    kit: {
      pending: [
        {
          id: 'duty-1',
          clubId: 'club-1',
          teamId: 'team-1',
          assignedUserId: 'tw',
          createdById: 'coach',
          kind: 'JERSEY_CLEANUP',
          status: 'PENDING',
          dueDate: null,
          notes: null,
          completedAt: null,
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T10:00:00.000Z',
        },
        {
          id: 'duty-2',
          clubId: 'club-1',
          teamId: 'team-1',
          assignedUserId: 'st',
          createdById: 'coach',
          kind: 'LOCKER_ROOM',
          status: 'PENDING',
          dueDate: null,
          notes: null,
          completedAt: null,
          createdAt: '2026-09-21T10:00:00.000Z',
          updatedAt: '2026-09-21T10:00:00.000Z',
        },
      ],
      recent: [],
    },
    ...overrides,
  } as RosterOpsSnapshot
}

describe('positionLine', () => {
  it.each([
    ['TW', 'TW'],
    ['Torwart', 'TW'],
    ['GK', 'TW'],
    ['POR', 'TW'],
    ['KL', 'TW'],
    ['IV', 'ABWEHR'],
    ['iv/rv', 'ABWEHR'],
    ['CB', 'ABWEHR'],
    ['DC', 'ABWEHR'],
    ['STP', 'ABWEHR'],
    ['ZM', 'MITTELFELD'],
    ['CM', 'MITTELFELD'],
    ['MOC', 'MITTELFELD'],
    ['TRQ', 'MITTELFELD'],
    ['OOS', 'MITTELFELD'],
    ['ST', 'STURM'],
    ['Sturm', 'STURM'],
    ['LW', 'STURM'],
    ['BU', 'STURM'],
    ['PL', 'STURM'],
    ['SNT', 'STURM'],
    ['', 'OHNE'],
    [null, 'OHNE'],
    ['Libero-ish?', 'ABWEHR'],
    ['Joker', 'OHNE'],
  ])('%s → %s', (input, line) => {
    expect(positionLine(input as string | null)).toBe(line)
  })
})

describe('availabilityOf', () => {
  it('lets an injury win over a Sperre and reads the injury return date', () => {
    const result = availabilityOf(
      { userId: 'iv', absence: 'SUSPENDED', absenceUntil: null },
      snapshot().medic.active,
      NOW,
    )
    expect(result).toEqual(
      expect.objectContaining({ kind: 'INJURED', until: '2026-10-15T21:59:00.000Z' }),
    )
  })

  it('treats an expired absence as fit', () => {
    expect(
      availabilityOf({ userId: 'x', absence: 'AWAY', absenceUntil: '2026-09-01T00:00:00.000Z' }, [], NOW),
    ).toEqual({ kind: 'FIT' })
  })
})

describe('buildKader', () => {
  it('counts players only, keeps coaches apart and pins the signed-in player', () => {
    const model = buildKader(snapshot(), {
      userId: 'tw',
      rsvpByUser: { tw: 'YES', iv: 'NO' },
      now: NOW,
      includeInjuries: true,
    })

    expect(model.players.map((p) => p.userId)).toEqual(['tw', 'iv', 'zm', 'st', 'neu'])
    expect(model.coaches.map((p) => p.userId)).toEqual(['coach'])
    expect(model.inactive.map((p) => p.userId)).toEqual(['weg'])
    expect(model.trials.map((p) => p.userId)).toEqual(['trial'])
    expect(model.selfPlayer?.userId).toBe('tw')
    expect(model.counts).toEqual({ FIT: 2, INJURED: 1, SUSPENDED: 1, UNAVAILABLE: 0, AWAY: 1 })
    expect(model.squadCount).toBe(5)
    expect(model.openRequests).toBe(1)
    expect(model.players.find((p) => p.userId === 'iv')?.rsvp).toBe('NO')
    expect(model.players.find((p) => p.userId === 'zm')?.rsvp).toBeNull()
    expect(model.players.find((p) => p.userId === 'neu')?.isNew).toBe(true)
  })

  it('ignores injury data while the medic feature is switched off', () => {
    const model = buildKader(snapshot(), { userId: null, now: NOW, includeInjuries: false })
    expect(model.counts.INJURED).toBe(0)
    expect(model.players.find((p) => p.userId === 'iv')?.availability.kind).toBe('FIT')
  })

  it('leaves rsvp undefined when there is no upcoming event', () => {
    const model = buildKader(snapshot(), { userId: null, rsvpByUser: null, now: NOW })
    expect(model.players.every((p) => p.rsvp === undefined)).toBe(true)
  })

  it('falls back to counting players when an older API omits squadCount', () => {
    const legacy = snapshot()
    delete (legacy as Partial<RosterOpsSnapshot>).squadCount
    expect(buildKader(legacy, { userId: null, now: NOW }).squadCount).toBe(5)
  })
})

describe('groupKader', () => {
  it('groups by line in TW, Abwehr, Mittelfeld, Sturm order, then coaches, without the pinned player', () => {
    const model = buildKader(snapshot(), { userId: 'tw', now: NOW })
    const sections = groupKader(model, 'ALL')
    expect(sections.map((s) => s.key)).toEqual(['ABWEHR', 'MITTELFELD', 'STURM', 'OHNE', 'COACHES'])
    expect(sections.flatMap((s) => s.data).some((p) => p.userId === 'tw')).toBe(false)
  })

  it('filters to one availability and hides coaches', () => {
    const model = buildKader(snapshot(), { userId: null, now: NOW })
    const sections = groupKader(model, 'SUSPENDED')
    expect(sections.map((s) => s.key)).toEqual(['MITTELFELD'])
  })
})

describe('pendingDutyCount', () => {
  it('shows coaches the team count and players their own', () => {
    expect(pendingDutyCount(snapshot(), 'coach', true)).toBe(2)
    expect(pendingDutyCount(snapshot(), 'tw', false)).toBe(1)
    expect(pendingDutyCount(snapshot(), 'iv', false)).toBe(0)
    expect(pendingDutyCount(null, 'tw', false)).toBe(0)
  })
})

describe('endOfDayIso', () => {
  it('moves the date to the last minute of that local day', () => {
    const iso = endOfDayIso(new Date(2026, 9, 12, 8, 30))
    const end = new Date(iso)
    expect(end.getDate()).toBe(12)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })
})

// ── Kader adversarial fixes ────────────────────────────────────────────────
const NO_OPS = { trials: [], newPlayers: [], inactive: [], pendingCoaches: [] }
describe('H1: a coach who also plays', () => {
  const playingCoach = (role: string) =>
    member('pc', { id: `access-pc-${role}`, role, name: 'Tim Weber', position: 'ZM', jerseyNumber: 10 })

  it('appears in the squad AND in the Trainerteam', () => {
    const model = buildKader(
      snapshot({ squad: [playingCoach('HEAD_COACH'), playingCoach('PLAYER')], operations: NO_OPS }),
      { userId: null, now: NOW, includeInjuries: false },
    )
    expect(model.players.map((p) => p.userId)).toEqual(['pc'])
    expect(model.players[0].role).toBe('PLAYER')
    expect(model.coaches.map((p) => p.userId)).toEqual(['pc'])
  })

  it('pins the PLAYER row as "Du" when the playing coach is signed in', () => {
    const model = buildKader(
      snapshot({ squad: [playingCoach('HEAD_COACH'), playingCoach('PLAYER')], operations: NO_OPS }),
      { userId: 'pc', now: NOW, includeInjuries: false },
    )
    expect(model.selfPlayer?.role).toBe('PLAYER')
    expect(showSelfPin(model, 'ALL')).toBe(true)
  })

  it('still collapses a true duplicate (squad + newPlayers)', () => {
    const neu = member('neu', { operationalStatus: 'NEW_PLAYER' })
    const model = buildKader(
      snapshot({ squad: [neu], operations: { trials: [], newPlayers: [neu], inactive: [], pendingCoaches: [] } }),
      { userId: null, now: NOW, includeInjuries: false },
    )
    expect(model.players.filter((p) => p.userId === 'neu')).toHaveLength(1)
  })
})

describe('M4: positions across languages', () => {
  it.each([
    ['Linksaußen', 'STURM'],
    ['Rechtsaußen', 'STURM'],
    ['Außen', 'STURM'],
    ['Innenverteidigung', 'ABWEHR'],
    ['10er', 'MITTELFELD'],
    ['Centre back', 'ABWEHR'],
    ['Center Back', 'ABWEHR'],
    ['Left back', 'ABWEHR'],
    ['Right-back', 'ABWEHR'],
    ['Goalie', 'TW'],
    ['Arrière gauche', 'ABWEHR'],
    ['Arriere droit', 'ABWEHR'],
    ['Latéral', 'ABWEHR'],
    ['Zagueiro', 'ABWEHR'],
    ['Volante', 'MITTELFELD'],
    ['Atacante', 'STURM'],
    ['Centravanti', 'STURM'],
    ['Stoper', 'ABWEHR'],
    ['Sağ bek', 'ABWEHR'],
    ['Bek', 'ABWEHR'],
    ['Santrafor', 'STURM'],
    ['Kaleci', 'TW'],
    ['KALECİ', 'TW'],
    ['Torhüter', 'TW'],
    ['Torhuter', 'TW'],
  ])('%s → %s', (input, line) => {
    expect(positionLine(input)).toBe(line)
  })
})

describe('M5: youth Sperre shown as "Nicht verfügbar"', () => {
  it('maps the masked value to its own neutral availability and count', () => {
    const model = buildKader(
      snapshot({
        squad: [member('a', { absence: 'UNAVAILABLE', absenceUntil: '2026-10-10T21:59:00.000Z' })],
        operations: NO_OPS,
      }),
      { userId: null, now: NOW, includeInjuries: false },
    )
    expect(model.players[0].availability).toEqual({ kind: 'UNAVAILABLE', until: '2026-10-10T21:59:00.000Z' })
    expect(model.counts.UNAVAILABLE).toBe(1)
    expect(model.counts.SUSPENDED).toBe(0)
  })
})

describe('L4: filtering includes the signed-in player', () => {
  it('lists the self row in the filtered results and hides the pin', () => {
    const model = buildKader(
      snapshot({
        squad: [member('me', { absence: 'AWAY', position: 'IV' }), member('mate', { position: 'IV' })],
        operations: NO_OPS,
      }),
      { userId: 'me', now: NOW, includeInjuries: false },
    )
    expect(groupKader(model, 'ALL').flatMap((s) => s.data.map((p) => p.userId))).toEqual(['mate'])
    expect(groupKader(model, 'AWAY').flatMap((s) => s.data.map((p) => p.userId))).toEqual(['me'])
    expect(showSelfPin(model, 'AWAY')).toBe(false)
  })
})

describe('L5: players loaned out', () => {
  it('are listed but not counted as available and not in filters', () => {
    const model = buildKader(
      snapshot({
        squadCount: undefined as never,
        operations: NO_OPS,
        squad: [
          member('a'),
          member('loanee', { loanedOutToTeamName: 'Herren 2', loanedOutUntil: '2027-06-30T00:00:00.000Z' }),
        ],
      }),
      { userId: null, now: NOW, includeInjuries: false },
    )
    expect(model.players.map((p) => p.userId).sort()).toEqual(['a', 'loanee'])
    expect(model.counts.FIT).toBe(1)
    expect(model.squadCount).toBe(1)
    expect(groupKader(model, 'FIT').flatMap((s) => s.data.map((p) => p.userId))).toEqual(['a'])
  })
})

describe('H2: private chat offered only when the API allows it', () => {
  it('reads the server flag; old APIs without it keep the DM endpoint as gate', () => {
    expect(canMessageMember({ canMessage: false, isSelf: false })).toBe(false)
    expect(canMessageMember({ canMessage: true, isSelf: false })).toBe(true)
    expect(canMessageMember({ canMessage: undefined, isSelf: false })).toBe(true)
    expect(canMessageMember({ canMessage: true, isSelf: true })).toBe(false)
  })
})

describe('L2: shirt numbers already worn', () => {
  it('maps numbers to their wearer, except the player being edited', () => {
    const model = buildKader(snapshot(), { userId: null, now: NOW, includeInjuries: false })
    const holders = jerseyHolders(model, 'iv')
    expect(holders.get(1)).toBe('Julian Becker')
    expect(holders.has(5)).toBe(false)
  })
})

describe('M2: duties of a linked child count for the parent', () => {
  it('counts CHILD duties in the parent badge', () => {
    const snap = snapshot({
      kit: {
        pending: [
          { id: 'd1', assignedUserId: 'child', viewerRelation: 'CHILD' },
          { id: 'd2', assignedUserId: 'someone', viewerRelation: null },
        ] as never,
        recent: [],
      },
    })
    expect(pendingDutyCount(snap, 'parent', false)).toBe(1)
  })
})

describe('M1: manager actions only when the role is known', () => {
  it.each([
    [{ roleMode: 'COACH', clubRole: 'COACH', teamRole: 'PLAYER' }, false],
    [{ roleMode: null, clubRole: 'COACH', teamRole: null }, false],
    [{ roleMode: 'COACH', clubRole: 'PLAYER', teamRole: 'HEAD_COACH' }, true],
    [{ roleMode: 'COACH', clubRole: 'PLAYER', teamRole: 'ASSISTANT_COACH' }, true],
    [{ roleMode: 'ADMIN', clubRole: 'ADMIN', teamRole: null }, true],
    [{ roleMode: null, clubRole: 'OWNER', teamRole: null }, true],
    [{ roleMode: 'PLAYER', clubRole: 'OWNER', teamRole: 'HEAD_COACH' }, false],
    [{ roleMode: null, clubRole: undefined, teamRole: undefined }, false],
  ])('%o → %s', (input, expected) => {
    expect(resolveIsTeamCoach(input)).toBe(expected)
  })
})

describe('H3: own team in the table', () => {
  it('highlights only the exact linked team, never a same-prefix neighbour', () => {
    const own = ownTeamNameOf([{ ownTeamName: null }, { ownTeamName: 'SV Babelsberg 03' }])
    expect(own).toBe('SV Babelsberg 03')
    expect(isOwnTableRow('SV Babelsberg 03', own)).toBe(true)
    expect(isOwnTableRow('SV Babelsberg 03 II', own)).toBe(false)
    expect(isOwnTableRow('SV Babelsberg-03', own)).toBe(true)
    expect(isOwnTableRow('SV Babelsberg 03', null)).toBe(false)
  })
})
