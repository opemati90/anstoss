import { InboxService, decodeCursor, encodeCursor } from './inbox.service'
import { isInboxWorthy } from './inbox.policy'

function buildPrisma() {
  return {
    inboxNotification: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'en' }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', preferredLanguage: 'de' },
        { id: 'u2', preferredLanguage: 'en' },
      ]),
    },
  }
}

describe('inbox policy', () => {
  it('keeps actionable templates and drops chat traffic', () => {
    expect(isInboxWorthy('JOIN_REQUEST', {})).toBe(true)
    expect(isInboxWorthy('CONTRIBUTION_PAID', {})).toBe(true)
    expect(isInboxWorthy('CHAT_MESSAGE', {})).toBe(false)
    expect(isInboxWorthy('DM_MESSAGE', {})).toBe(false)
    expect(isInboxWorthy('GOAL', { scoreline: '1:0' })).toBe(false)
  })

  it('keeps only declines from RSVP updates', () => {
    expect(isInboxWorthy('RSVP_UPDATE', { status: 'NO' })).toBe(true)
    expect(isInboxWorthy('RSVP_UPDATE', { status: 'YES' })).toBe(false)
    expect(isInboxWorthy('RSVP_UPDATE', { status: 'MAYBE' })).toBe(false)
  })
})

describe('InboxService', () => {
  it('stores one template row per unique recipient with the deep-link target', async () => {
    const prisma = buildPrisma()
    const inbox = new InboxService(prisma as never)
    await inbox.record(['u1', 'u1', 'u2', ''], {
      kind: 'template',
      type: 'JOIN_REQUEST',
      data: { userName: 'Paul', clubName: 'SV' },
      target: { type: 'join_request', clubId: 'c1', requestId: 'r1' },
    })
    const rows = prisma.inboxNotification.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      userId: 'u1',
      type: 'JOIN_REQUEST',
      clubId: 'c1',
      target: { type: 'join_request', clubId: 'c1', requestId: 'r1' },
    })
  })

  it('renders computed pushes in each recipient language at write time', async () => {
    const prisma = buildPrisma()
    const inbox = new InboxService(prisma as never)
    const render = jest.fn((locale: string) => ({ title: `t-${locale}`, body: `b-${locale}` }))
    await inbox.record(['u1', 'u2'], { kind: 'rendered', type: 'FIXTURE_CHANGED', render })
    const rows = prisma.inboxNotification.createMany.mock.calls[0][0].data
    expect(rows.map((r: { title: string }) => r.title)).toEqual(['t-de', 't-en'])
  })

  it('never throws when the write fails (the push must still go out)', async () => {
    const prisma = buildPrisma()
    prisma.inboxNotification.createMany.mockRejectedValue(new Error('db down'))
    const inbox = new InboxService(prisma as never)
    await expect(
      inbox.record(['u1'], { kind: 'template', type: 'JOIN_APPROVED', data: { clubName: 'SV' } }),
    ).resolves.toBeUndefined()
  })

  it('renders template rows in the reader language and pages with a cursor', async () => {
    const prisma = buildPrisma()
    const created = new Date('2026-11-13T09:41:00Z')
    prisma.inboxNotification.findMany.mockResolvedValue([
      {
        id: 'n2',
        type: 'JOIN_APPROVED',
        data: { clubName: 'SV Spreewiese' },
        title: null,
        body: null,
        target: { clubId: 'c1', bad: 42 },
        clubId: 'c1',
        teamId: null,
        createdAt: created,
        readAt: null,
      },
      {
        id: 'n1',
        type: 'FIXTURE_CHANGED',
        data: null,
        title: 'Spielplan aktualisiert',
        body: 'Anstoß verschoben',
        target: null,
        clubId: 'c1',
        teamId: 't1',
        createdAt: created,
        readAt: created,
      },
    ])
    prisma.inboxNotification.count.mockResolvedValue(1)
    const inbox = new InboxService(prisma as never)

    const page = await inbox.list('u1', { limit: 1 })

    expect(page.unreadCount).toBe(1)
    expect(page.items).toHaveLength(1)
    // Rendered on read in the reader's current language (en), not stored copy.
    expect(page.items[0].title).toBe('Welcome to SV Spreewiese!')
    expect(page.items[0].body).toBe('Your join request was approved.')
    // Non-string values never leak into the deep-link target.
    expect(page.items[0].target).toEqual({ clubId: 'c1' })
    expect(decodeCursor(page.nextCursor ?? undefined)).toEqual({ createdAt: created, id: 'n2' })
    expect(prisma.inboxNotification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1' },
      take: 2,
    })
  })

  it('applies the cursor as a strict (createdAt, id) keyset', async () => {
    const prisma = buildPrisma()
    const inbox = new InboxService(prisma as never)
    const at = new Date('2026-11-10T08:00:00Z')
    await inbox.list('u1', { limit: 30, cursor: encodeCursor(at, 'n9') })
    expect(prisma.inboxNotification.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'n9' } }],
    })
  })

  it('ignores a malformed cursor instead of failing', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull()
  })

  it('only marks the caller’s own entry read', async () => {
    const prisma = buildPrisma()
    prisma.inboxNotification.updateMany.mockResolvedValue({ count: 0 })
    const inbox = new InboxService(prisma as never)
    await expect(inbox.markRead('u1', 'someone-elses')).rejects.toThrow('Notification not found')
    expect(prisma.inboxNotification.updateMany.mock.calls[0][0].where).toEqual({
      id: 'someone-elses',
      userId: 'u1',
    })
  })

  it('marks everything read for the caller only', async () => {
    const prisma = buildPrisma()
    const inbox = new InboxService(prisma as never)
    await expect(inbox.markAllRead('u1')).resolves.toEqual({ unreadCount: 0 })
    expect(prisma.inboxNotification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      readAt: null,
    })
  })
})
