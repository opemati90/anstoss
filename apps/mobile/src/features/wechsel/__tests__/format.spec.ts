import { TrialInviteStatus, type TrialInvite } from '@anstoss/shared'

jest.mock('../../../i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
}))

import {
  formatDate,
  fromIsoDate,
  playerMeta,
  stageOf,
  statusChip,
  toIsoDate,
  wechselperiodeHint,
} from '../format'

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never

function invite(overrides: Partial<TrialInvite>): TrialInvite {
  return {
    id: 'i',
    clubId: 'c',
    freeAgentProfileId: 'p',
    teamId: 't',
    sentByUserId: 's',
    message: null,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: TrialInviteStatus.PENDING,
    respondedAt: null,
    createdAt: new Date().toISOString(),
    initiatedBy: 'CLUB' as TrialInvite['initiatedBy'],
    playerSearchId: null,
    sessionEventIds: [],
    sessions: [],
    decisionMessage: null,
    decidedAt: null,
    club: { id: 'c', name: 'SV Albatros', badgeUrl: null, primaryColor: '#123456' },
    team: { id: 't', displayName: 'Herren II', groupName: null },
    sender: { id: 's', name: 'Mara Schulz' },
    player: {
      profileId: 'p',
      userId: 'u',
      name: 'Amir Kaya',
      avatarUrl: null,
      position: null,
      preferredFoot: null,
      highestLeague: null,
      age: null,
      isMinor: false,
    },
    joinRequest: null,
    ...overrides,
  }
}

describe('wechsel format helpers', () => {
  it('labels open stages and closed outcomes', () => {
    expect(statusChip(t, invite({ status: TrialInviteStatus.REQUESTED }))).toEqual({
      label: 'probetraining.stage.REQUESTED',
      tone: 'warning',
    })
    expect(statusChip(t, invite({ status: TrialInviteStatus.OFFERED }))).toEqual({
      label: 'probetraining.outcome.OFFERED',
      tone: 'success',
    })
    expect(statusChip(t, invite({ status: TrialInviteStatus.JOINED })).tone).toBe('success')
    expect(statusChip(t, invite({ status: TrialInviteStatus.EXPIRED })).label).toBe(
      'probetraining.outcome.EXPIRED',
    )
  })

  it('moves an accepted trial to the decision once its sessions are over', () => {
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(
      stageOf(
        invite({
          status: TrialInviteStatus.ACCEPTED,
          sessions: [{ id: 'e', title: 'Training', date: past, location: null, cancelledAt: null }],
        }),
      ),
    ).toBe('DECISION')
  })

  it('round-trips local calendar dates', () => {
    const date = fromIsoDate('2026-07-01')
    expect(date.getMonth()).toBe(6)
    expect(toIsoDate(date)).toBe('2026-07-01')
    expect(formatDate(date)).toBe('01.07.2026')
  })

  it('builds a compact player line', () => {
    expect(playerMeta(t, { age: 24, position: 'MID', preferredFoot: 'RIGHT' })).toBe(
      'spielerprofil.ageShort:{"count":24} · spielerprofil.position.MID · spielerprofil.foot.RIGHT',
    )
  })

  it('explains the Wechselperiode for a chosen date', () => {
    expect(wechselperiodeHint(t, new Date(2027, 0, 10))).toContain('wechsel.periodInside')
    const outside = wechselperiodeHint(t, new Date(2026, 9, 1))
    expect(outside).toContain('wechsel.periodOutside')
    expect(outside).toContain('01.01.2027')
  })
})
