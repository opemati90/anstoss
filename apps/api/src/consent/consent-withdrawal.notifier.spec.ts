import { ConsentWithdrawalNotifier } from './consent-withdrawal.notifier'
import { formatPush } from '../push/push.templates'
import type { ConsentWithdrawalEffect } from './consent-withdrawal'

describe('ConsentWithdrawalNotifier', () => {
  const effect: ConsentWithdrawalEffect = {
    consentId: 'consent-1',
    clubId: 'club-1',
    teamId: 'team-1',
    playerUserId: 'child-1',
    guardianUserId: 'guardian-1',
    guardianEmail: 'anna@example.com',
    reason: 'guardian_request',
    note: null,
    accessRevoked: true,
    disconnectedParentUserIds: [],
  }

  function create() {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue({ name: 'SV Albatros' }) },
      team: { findFirst: jest.fn().mockResolvedValue({ displayName: 'E-Jugend', name: 'E1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Mia Weber' }) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([{ userId: 'coach-1' }]) },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin-1' }, { userId: 'owner-1' }]),
      },
    }
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    return { prisma, push, notifier: new ConsentWithdrawalNotifier(prisma as never, push as never) }
  }

  it('notifies admins, the team coaches (M4) and the guardian, except the acting user', async () => {
    const { push, prisma, notifier } = create()
    await notifier.handle({ effects: [effect], actorUserId: 'admin-1' })
    const recipients = push.sendToUserLocalized.mock.calls.map((c) => c[0]).sort()
    expect(recipients).toEqual(['coach-1', 'guardian-1', 'owner-1'])
    // Coaches: only active HEAD/ASSISTANT coaches of this club's team.
    expect(prisma.teamAccess.findMany).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        teamId: 'team-1',
        role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
        status: 'ACTIVE',
      },
      select: { userId: true },
    })
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'owner-1',
      'CONSENT_WITHDRAWN',
      { clubName: 'SV Albatros', childName: 'Mia Weber', teamName: 'E-Jugend', accessRevoked: true },
      { type: 'consent_withdrawn', clubId: 'club-1' },
      { clubId: 'club-1' },
    )
  })

  it('confirms to the guardian when an admin acted on their request', async () => {
    const { push, notifier } = create()
    await notifier.handle({
      effects: [{ ...effect, reason: 'admin_on_guardian_request' }],
      actorUserId: 'admin-1',
    })
    const recipients = push.sendToUserLocalized.mock.calls.map((c) => c[0])
    expect(recipients).toEqual(expect.arrayContaining(['owner-1', 'guardian-1']))
    expect(recipients).not.toContain('admin-1')
  })

  it('does not push a guardian whose account was deleted', async () => {
    const { push, notifier } = create()
    await notifier.handle({
      effects: [{ ...effect, reason: 'guardian_account_deleted' }],
      actorUserId: null,
    })
    expect(push.sendToUserLocalized.mock.calls.map((c) => c[0])).not.toContain('guardian-1')
  })

  it('never throws when delivery fails (withdrawal is already committed)', async () => {
    const { push, notifier } = create()
    push.sendToUserLocalized.mockRejectedValue(new Error('expo down'))
    await expect(notifier.handle({ effects: [effect], actorUserId: null })).resolves.toBeUndefined()
  })

  it('renders the push in every API locale, stating whether access was removed', () => {
    for (const l of ['de', 'en', 'fr', 'it', 'pt'] as const) {
      const revoked = formatPush(
        'CONSENT_WITHDRAWN',
        { clubName: 'SV Albatros', childName: 'Mia', teamName: 'E-Jugend', accessRevoked: true },
        l,
      )
      const kept = formatPush(
        'CONSENT_WITHDRAWN',
        { clubName: 'SV Albatros', childName: 'Mia', teamName: 'E-Jugend', accessRevoked: false },
        l,
      )
      expect(revoked.title).toBe('SV Albatros')
      expect(revoked.body).toContain('Mia')
      expect(revoked.body).not.toBe(kept.body)
      expect(formatPush('MODERATION_REPORT_CREATED', { clubName: 'SV Albatros' }, l).body).toMatch(/24/)
    }
  })
})
