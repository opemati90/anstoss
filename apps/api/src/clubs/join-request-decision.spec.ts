import { findLatestJoinDecision } from './join-request-decision'

// Onboarding review fix (M2).
describe('findLatestJoinDecision', () => {
  const club = { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' }
  function db(row: Record<string, unknown> | null, reason?: string) {
    return {
      joinRequest: { findFirst: jest.fn().mockResolvedValue(row) },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(reason === undefined ? null : { metadata: { reason } }),
      },
    }
  }

  it('reports a rejection with the club reason', async () => {
    const d = db(
      { id: 'jr-1', clubId: 'club-1', status: 'REJECTED', reviewedAt: new Date(), club },
      'Der Kader der U17 ist voll. Frag gern im Sommer wieder an.',
    )
    await expect(findLatestJoinDecision(d as never, 'u-1')).resolves.toMatchObject({
      status: 'REJECTED',
      reason: 'Der Kader der U17 ist voll. Frag gern im Sommer wieder an.',
      club,
    })
    expect(d.auditLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'join_request.rejected',
          metadata: { path: ['requestId'], equals: 'jr-1' },
        }),
      }),
    )
  })

  it('reports a rejection without a reason as null', async () => {
    const d = db({ id: 'jr-1', clubId: 'club-1', status: 'REJECTED', reviewedAt: new Date(), club })
    await expect(findLatestJoinDecision(d as never, 'u-1')).resolves.toMatchObject({ reason: null })
  })

  it('reports an approval without reading the audit log', async () => {
    const d = db({ id: 'jr-1', clubId: 'club-1', status: 'APPROVED', reviewedAt: new Date(), club })
    await expect(findLatestJoinDecision(d as never, 'u-1')).resolves.toMatchObject({
      status: 'APPROVED',
    })
    expect(d.auditLog.findFirst).not.toHaveBeenCalled()
  })

  it('ignores withdrawn, pending and old decisions', async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    await expect(
      findLatestJoinDecision(db({ id: 'a', clubId: 'c', status: 'WITHDRAWN', reviewedAt: new Date() }) as never, 'u'),
    ).resolves.toBeNull()
    await expect(
      findLatestJoinDecision(db({ id: 'a', clubId: 'c', status: 'REJECTED', reviewedAt: old }) as never, 'u'),
    ).resolves.toBeNull()
    await expect(findLatestJoinDecision(db(null) as never, 'u')).resolves.toBeNull()
  })
})
