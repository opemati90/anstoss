import { ForbiddenException } from '@nestjs/common'
import { DmService } from './dm.service'

const adultDob = new Date('1990-01-01T00:00:00.000Z')
const minorDob = new Date('2014-01-01T00:00:00.000Z')

function makePrisma() {
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    membership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership' }) },
    user: { findMany: jest.fn() },
    userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
    guardianRelationship: { findFirst: jest.fn().mockResolvedValue(null) },
    parentalConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    conversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'conversation', participants: [] }),
      update: jest.fn(),
    },
    conversationParticipant: { findFirst: jest.fn() },
    directMessage: { create: jest.fn() },
  } as any
  prisma.$transaction = jest.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma))
  return prisma
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new DmService(prisma, {
    detectAndPersistSource: jest.fn().mockResolvedValue(undefined),
  } as any)
}

function users(firstDob: Date, secondDob: Date, managedById: string | null = null) {
  return [
    { id: 'user-1', dateOfBirth: firstDob, managedById },
    { id: 'user-2', dateOfBirth: secondDob, managedById: null },
  ]
}

describe('DmService private-message safeguarding', () => {
  it('blocks an unrelated adult and minor from creating a conversation', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue(users(minorDob, adultDob))
    const service = makeService(prisma)

    await expect(service.findOrCreateConversation('user-1', 'club-1', 'user-2')).rejects.toThrow(
      'Direct messages between minors and adults are limited to linked guardians',
    )
    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })

  it('fails closed when either participant has no verified date of birth', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', dateOfBirth: null, managedById: null },
      { id: 'user-2', dateOfBirth: adultDob, managedById: null },
    ])
    const service = makeService(prisma)

    await expect(service.findOrCreateConversation('user-1', 'club-1', 'user-2')).rejects.toThrow(
      'Age verification is required before private messaging',
    )
    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })

  it('allows two minors and two adults to create conversations', async () => {
    const prisma = makePrisma()
    const service = makeService(prisma)

    prisma.user.findMany.mockResolvedValueOnce(users(minorDob, minorDob))
    await service.findOrCreateConversation('user-1', 'club-1', 'user-2')

    prisma.user.findMany.mockResolvedValueOnce(users(adultDob, adultDob))
    await service.findOrCreateConversation('user-1', 'club-1', 'user-2')

    expect(prisma.conversation.create).toHaveBeenCalledTimes(2)
  })

  it('treats the sixteenth birthday as the exact safeguarding boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T12:00:00.000Z'))
    try {
      const prisma = makePrisma()
      const service = makeService(prisma)

      prisma.user.findMany.mockResolvedValueOnce(users(new Date('2010-08-26'), adultDob))
      await expect(
        service.findOrCreateConversation('user-1', 'club-1', 'user-2'),
      ).resolves.toMatchObject({ id: 'conversation' })

      prisma.user.findMany.mockResolvedValueOnce(users(new Date('2010-08-27'), adultDob))
      await expect(service.findOrCreateConversation('user-1', 'club-1', 'user-2')).rejects.toThrow(
        'Direct messages between minors and adults are limited to linked guardians',
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('allows the adult who manages a minor sub-profile', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue(users(minorDob, adultDob, 'user-2'))
    const service = makeService(prisma)

    await expect(
      service.findOrCreateConversation('user-1', 'club-1', 'user-2'),
    ).resolves.toMatchObject({ id: 'conversation' })
  })

  it('allows a managed minor when the adult initiates the conversation', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', dateOfBirth: adultDob, managedById: null },
      { id: 'user-2', dateOfBirth: minorDob, managedById: 'user-1' },
    ])
    const service = makeService(prisma)

    await expect(
      service.findOrCreateConversation('user-1', 'club-1', 'user-2'),
    ).resolves.toMatchObject({ id: 'conversation' })
  })

  it('allows a club-scoped linked guardian and does not accept another club link', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue(users(minorDob, adultDob))
    prisma.guardianRelationship.findFirst.mockResolvedValue({ id: 'guardian-link' })
    const service = makeService(prisma)

    await service.findOrCreateConversation('user-1', 'club-1', 'user-2')

    expect(prisma.guardianRelationship.findFirst).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        parentUserId: 'user-2',
        playerUserId: 'user-1',
      },
      select: { id: true },
    })
  })

  it('allows an approved parental-consent guardian', async () => {
    const prisma = makePrisma()
    prisma.user.findMany.mockResolvedValue(users(minorDob, adultDob))
    prisma.parentalConsent.findFirst.mockResolvedValue({ id: 'consent' })
    const service = makeService(prisma)

    await expect(
      service.findOrCreateConversation('user-1', 'club-1', 'user-2'),
    ).resolves.toMatchObject({ id: 'conversation' })
    expect(prisma.parentalConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clubId: 'club-1', status: 'APPROVED' }),
      }),
    )
  })

  it('rechecks safeguarding before sending into an existing conversation', async () => {
    const prisma = makePrisma()
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      conversation: {
        clubId: 'club-1',
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
      },
    })
    prisma.user.findMany.mockResolvedValue(users(minorDob, adultDob))
    const service = makeService(prisma)

    await expect(service.saveMessage('user-1', 'conversation-1', 'hello')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(prisma.directMessage.create).not.toHaveBeenCalled()
  })

  it('does not let a retained conversation bypass current club membership', async () => {
    const prisma = makePrisma()
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      conversation: {
        clubId: 'club-1',
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
      },
    })
    prisma.membership.findFirst
      .mockResolvedValueOnce({ id: 'sender-membership' })
      .mockResolvedValueOnce(null)
    const service = makeService(prisma)

    await expect(service.assertCanMessageConversation('user-1', 'conversation-1')).rejects.toThrow(
      'Not a member of this club',
    )
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    expect(prisma.membership.findFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-2', clubId: 'club-1' },
    })
  })

  it('allows an approved guardian to send in either direction', async () => {
    const prisma = makePrisma()
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      conversation: {
        clubId: 'club-1',
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
      },
    })
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', dateOfBirth: adultDob, managedById: null },
      { id: 'user-2', dateOfBirth: minorDob, managedById: 'user-1' },
    ])
    prisma.directMessage.create.mockResolvedValue({
      id: 'message-1',
      content: 'hello',
      sender: { id: 'user-1', name: 'Parent', avatarUrl: null },
    })
    const service = makeService(prisma)

    await expect(service.saveMessage('user-1', 'conversation-1', 'hello')).resolves.toMatchObject({
      id: 'message-1',
    })
    expect(prisma.directMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversationId: 'conversation-1',
          senderId: 'user-1',
          content: 'hello',
        },
      }),
    )
  })

  it('rechecks access after revocation serialization before inserting a message', async () => {
    const prisma = makePrisma()
    prisma.conversationParticipant.findFirst
      .mockResolvedValueOnce({
        conversation: {
          clubId: 'club-1',
          participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
        },
      })
      .mockResolvedValueOnce(null)
    const service = makeService(prisma)

    await expect(service.saveMessage('user-1', 'conversation-1', 'too late')).rejects.toThrow(
      'Not a participant in this conversation',
    )
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4)
    expect(prisma.directMessage.create).not.toHaveBeenCalled()
  })

  it('rejects malformed conversations instead of selecting an arbitrary peer', async () => {
    const prisma = makePrisma()
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      conversation: {
        clubId: 'club-1',
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }],
      },
    })
    const service = makeService(prisma)

    await expect(service.assertCanMessageConversation('user-1', 'conversation-1')).rejects.toThrow(
      'Not a participant in this conversation',
    )
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})
