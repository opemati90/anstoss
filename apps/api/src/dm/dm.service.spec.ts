import '../../test/future-capabilities'

/**
 * DmService against an in-memory Prisma that evaluates where clauses (L9):
 * guardian links only count for the right adult, child AND club; a stale
 * participant row never reopens a club the caller left; DM attachments are
 * only reachable by the two current participants.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DmService } from './dm.service'
import { CHAT_FAKE_SCHEMA, FakePrisma, yearsAgo } from '../test-utils/fake-prisma'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'
import type { ChatUploadKind } from '../media/chat-media-limits'

const CLUB = 'club-1'
const OTHER_CLUB = 'club-2'

type Seed = Record<string, Array<Record<string, unknown>>>

function user(id: string, dob: Date | null, extra: Record<string, unknown> = {}) {
  return { id, name: id, avatarUrl: null, dateOfBirth: dob, managedById: null, deletedAt: null, preferredLanguage: 'de', ...extra }
}

function baseSeed(): Seed {
  return {
    accountMediaDeletion: [],
    user: [
      user('coach', yearsAgo(40), { name: 'Tim Weber' }),
      user('player', yearsAgo(24), { name: 'Lukas Hoffmann' }),
      user('mum', yearsAgo(41), { name: 'Anna Hoffmann' }),
      user('kid', yearsAgo(12), { name: 'Ben Hoffmann' }),
      user('kid2', yearsAgo(13), { name: 'Mia Schulz' }),
      user('nodob', null),
      user('outsider', yearsAgo(30)),
    ],
    membership: ['coach', 'player', 'mum', 'kid', 'kid2', 'nodob'].map((userId, i) => ({
      id: `m${i}`,
      userId,
      clubId: CLUB,
      role: userId === 'coach' ? 'COACH' : userId === 'mum' ? 'PARENT' : 'PLAYER',
    })),
    teamAccess: [
      { id: 'ta1', userId: 'coach', clubId: CLUB, teamId: 'team-1', role: 'HEAD_COACH', phase: 'FULL', status: 'ACTIVE', loanEndDate: null },
      { id: 'ta2', userId: 'player', clubId: CLUB, teamId: 'team-1', role: 'PLAYER', phase: 'FULL', status: 'ACTIVE', loanEndDate: null },
    ],
    team: [{ id: 'team-1', clubId: CLUB, displayName: 'Herren I', name: 'Herren I' }],
    guardianRelationship: [],
    parentalConsent: [],
    userBlock: [],
    conversation: [],
    conversationParticipant: [],
    directMessage: [],
    directMessageReaction: [],
    directMessageReport: [],
    event: [],
  }
}

function conversation(seed: Seed, id: string, a: string, b: string, clubId = CLUB) {
  seed.conversation.push({ id, clubId, createdAt: new Date(), updatedAt: new Date() })
  seed.conversationParticipant.push(
    { id: `${id}-${a}`, conversationId: id, userId: a, lastReadAt: new Date(0), muted: false, mutedUntil: null },
    { id: `${id}-${b}`, conversationId: id, userId: b, lastReadAt: new Date('2026-09-20T10:00:00Z'), muted: false, mutedUntil: null },
  )
}

function build(mutate?: (seed: Seed) => void, opts: { r2?: Record<string, unknown> | null } = {}) {
  const seed = baseSeed()
  mutate?.(seed)
  const prisma = new FakePrisma(CHAT_FAKE_SCHEMA, seed)
  const translation = {
    detectAndPersistSource: jest.fn().mockResolvedValue(undefined),
    resolveTargetLanguage: jest.fn().mockReturnValue('de'),
    translateForReader: jest.fn().mockResolvedValue(null),
  }
  const r2 =
    opts.r2 === null
      ? undefined
      : {
          enabled: true,
          objectKeyFromUrl: jest.fn((url: string) =>
            url.startsWith('https://cdn.example/') ? url.slice('https://cdn.example/'.length) : null,
          ),
          assertStoredObject: jest.fn().mockResolvedValue(undefined),
          presignPut: jest.fn().mockResolvedValue({ uploadUrl: 'https://put', publicUrl: 'https://cdn.example/x' }),
          presignGet: jest.fn().mockResolvedValue('https://signed.example/get'),
          deleteObjects: jest.fn().mockResolvedValue(undefined),
          ...(opts.r2 ?? {}),
        }
  const events = { emit: jest.fn() }
  const service = new DmService(prisma as never, translation as never, r2 as never, events as never)
  return { prisma, service, r2, events }
}

describe('DmService private-message safeguarding (where-matching)', () => {
  it('blocks an unrelated adult and minor from creating a conversation', async () => {
    const { service, prisma } = build()
    await expect(service.findOrCreateConversation('coach', CLUB, 'kid')).rejects.toThrow(
      'Direct messages between minors and adults are limited to linked guardians',
    )
    expect(prisma.rows('conversation')).toHaveLength(0)
  })

  it('fails closed without a verified date of birth', async () => {
    const { service } = build()
    await expect(service.findOrCreateConversation('nodob', CLUB, 'player')).rejects.toThrow(
      'Age verification is required before private messaging',
    )
  })

  it('keeps under-16s group-only: minor↔minor is rejected', async () => {
    const { service } = build()
    await expect(service.findOrCreateConversation('kid', CLUB, 'kid2')).rejects.toThrow(
      'Under-16s can only message their guardians privately',
    )
  })

  it('allows two adults and reuses only a conversation of the same club', async () => {
    const { service, prisma } = build((s) => conversation(s, 'foreign', 'coach', 'player', OTHER_CLUB))
    const created = await service.findOrCreateConversation('coach', CLUB, 'player')
    expect(created.id).not.toBe('foreign')
    expect(prisma.rows('conversation').find((c) => c.id === created.id)).toMatchObject({ clubId: CLUB })
  })

  it('accepts a guardian link only for this adult, this child and this club', async () => {
    // Links that must NOT count: another club, another child, another adult.
    const { service } = build((s) => {
      s.guardianRelationship.push(
        { id: 'g-other-club', clubId: OTHER_CLUB, teamId: null, parentUserId: 'mum', playerUserId: 'kid' },
        { id: 'g-other-child', clubId: CLUB, teamId: null, parentUserId: 'mum', playerUserId: 'kid2' },
        { id: 'g-other-adult', clubId: CLUB, teamId: null, parentUserId: 'coach', playerUserId: 'kid2' },
      )
    })
    await expect(service.findOrCreateConversation('mum', CLUB, 'kid')).rejects.toThrow(
      'limited to linked guardians',
    )

    const linked = build((s) => {
      s.guardianRelationship.push({ id: 'g', clubId: CLUB, teamId: null, parentUserId: 'mum', playerUserId: 'kid' })
    })
    await expect(linked.service.findOrCreateConversation('kid', CLUB, 'mum')).resolves.toMatchObject({
      id: expect.any(String),
    })
  })

  it('accepts only an APPROVED parental consent of this club', async () => {
    const pending = build((s) => {
      s.parentalConsent.push({ id: 'pc', clubId: CLUB, teamId: 'team-1', playerUserId: 'kid', guardianUserId: 'mum', status: 'PENDING' })
    })
    await expect(pending.service.findOrCreateConversation('mum', CLUB, 'kid')).rejects.toThrow(ForbiddenException)

    const approved = build((s) => {
      s.parentalConsent.push({ id: 'pc', clubId: CLUB, teamId: 'team-1', playerUserId: 'kid', guardianUserId: 'mum', status: 'APPROVED' })
    })
    await expect(approved.service.findOrCreateConversation('mum', CLUB, 'kid')).resolves.toBeDefined()
  })

  it('allows the adult who manages a minor sub-profile', async () => {
    const { service } = build((s) => {
      ;(s.user.find((u) => u.id === 'kid') as Record<string, unknown>).managedById = 'mum'
    })
    await expect(service.findOrCreateConversation('mum', CLUB, 'kid')).resolves.toBeDefined()
  })

  it('treats the sixteenth birthday as the exact boundary', async () => {
    const turnsSixteenToday = new Date()
    turnsSixteenToday.setUTCFullYear(turnsSixteenToday.getUTCFullYear() - 16)
    const tomorrow = new Date(turnsSixteenToday)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    const today = build((s) => s.user.push(user('teen', turnsSixteenToday)) && s.membership.push({ id: 'mt', userId: 'teen', clubId: CLUB, role: 'PLAYER' }))
    await expect(today.service.findOrCreateConversation('coach', CLUB, 'teen')).resolves.toBeDefined()

    const notYet = build((s) => s.user.push(user('teen', tomorrow)) && s.membership.push({ id: 'mt', userId: 'teen', clubId: CLUB, role: 'PLAYER' }))
    await expect(notYet.service.findOrCreateConversation('coach', CLUB, 'teen')).rejects.toThrow(ForbiddenException)
  })

  it('rechecks safeguarding on every send, and blocks a blocked pair', async () => {
    const { service, prisma } = build((s) => {
      conversation(s, 'c1', 'coach', 'kid')
      s.userBlock.push({ id: 'b', blockerUserId: 'player', blockedUserId: 'coach' })
      conversation(s, 'c2', 'coach', 'player')
    })
    await expect(service.saveMessage('coach', 'c1', 'hallo')).rejects.toThrow(ForbiddenException)
    await expect(service.saveMessage('coach', 'c2', 'hallo')).rejects.toThrow('Cannot send messages to this user')
    expect(prisma.rows('directMessage')).toHaveLength(0)
  })

  it('rejects malformed conversations instead of picking an arbitrary peer', async () => {
    const { service } = build((s) => {
      s.conversation.push({ id: 'c3', clubId: CLUB })
      s.conversationParticipant.push(
        { id: 'p1', conversationId: 'c3', userId: 'coach', lastReadAt: new Date() },
        { id: 'p2', conversationId: 'c3', userId: 'player', lastReadAt: new Date() },
        { id: 'p3', conversationId: 'c3', userId: 'mum', lastReadAt: new Date() },
      )
    })
    await expect(service.getMessages('coach', 'c3')).rejects.toThrow('Not a participant')
  })
})

describe('transaction-bound private upload authorization', () => {
  it('returns only the authorized target after deterministic lifecycle locks', async () => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    const locks: string[] = []
    prisma.$executeRaw = async (...values: unknown[]) => { locks.push(String(values[1])); return 0 }
    await expect(service.authorizePrivateUpload('coach', CLUB, 'c1', prisma as never)).resolves.toEqual({
      userId: 'coach', clubId: CLUB, targetType: 'DM', targetId: 'c1',
    })
    expect(locks).toEqual(['dm-user:coach', 'dm-user:player', 'dm-access:club-1:coach', 'dm-access:club-1:player'])
  })

  it('rejects a club mismatch before acquiring upload-related locks', async () => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    const lock = jest.spyOn(prisma, '$executeRaw')
    await expect(service.authorizePrivateUpload('coach', OTHER_CLUB, 'c1', prisma as never)).rejects.toThrow('does not belong')
    expect(lock).not.toHaveBeenCalled()
  })

  it.each(['removed', 'blocked', 'deleted', 'changed-peer'])('rechecks %s after waiting for locks', async (change) => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    jest.spyOn(prisma, '$executeRaw').mockImplementationOnce(async () => {
      if (change === 'removed') {
        const memberships = prisma.rows('membership')
        memberships.splice(memberships.findIndex((m) => m.userId === 'player'), 1)
      }
      if (change === 'blocked') prisma.rows('userBlock').push({ id: 'blocked', blockerUserId: 'player', blockedUserId: 'coach' })
      if (change === 'deleted') prisma.rows('user').find((u) => u.id === 'player')!.deletedAt = new Date()
      if (change === 'changed-peer') prisma.rows('conversationParticipant').find((p) => p.userId === 'player')!.userId = 'mum'
      return 0
    })
    await expect(service.authorizePrivateUpload('coach', CLUB, 'c1', prisma as never)).rejects.toThrow(ForbiddenException)
    expect(prisma.rows('directMessage')).toHaveLength(0)
  })

  it.each(['kid', 'nodob', 'outsider'])('does not bypass safeguarding/membership for %s', async (peer) => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', peer))
    await expect(service.authorizePrivateUpload('coach', CLUB, 'c1', prisma as never)).rejects.toThrow(ForbiddenException)
  })
})

describe('transaction-bound private DM media read authorization', () => {
  it('allows the remaining member to read history after the peer leaves or blocks', async () => {
    const { service, prisma } = build((s) => {
      conversation(s, 'c1', 'coach', 'player')
      s.membership = s.membership.filter((row) => row.userId !== 'player')
      s.userBlock.push({ id: 'block', blockerUserId: 'player', blockedUserId: 'coach' })
    })
    const locks: string[] = []
    prisma.$executeRaw = async (...values: unknown[]) => { locks.push(String(values[1])); return 0 }
    await expect(service.authorizePrivateMediaRead('coach', CLUB, 'c1', prisma as never)).resolves.toEqual({
      userId: 'coach', clubId: CLUB, targetType: 'DM', targetId: 'c1',
    })
    expect(locks).toEqual(['dm-user:coach', 'dm-user:player', 'dm-access:club-1:coach'])
  })

  it('locks the scope rows in team-access-before-membership order', async () => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    const rows: string[] = []
    jest.spyOn(prisma, '$queryRaw').mockImplementation(async (query?: unknown) => {
      rows.push((query as TemplateStringsArray).join(''))
      return []
    })
    await service.authorizePrivateMediaRead('coach', CLUB, 'c1', prisma as never)
    expect(rows).toEqual([
      expect.stringContaining('FROM "TeamAccess"'), expect.stringContaining('FROM "Membership"'),
      expect.stringContaining('FROM "Conversation"'), expect.stringContaining('FROM "ConversationParticipant"'),
    ])
  })

  it.each(['reader-removed', 'reader-deleted', 'peer-changed'])('rechecks %s after acquiring locks', async (change) => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    jest.spyOn(prisma, '$executeRaw').mockImplementationOnce(async () => {
      if (change === 'reader-removed') prisma.tables.membership = prisma.rows('membership').filter((row) => row.userId !== 'coach')
      if (change === 'reader-deleted') prisma.rows('user').find((row) => row.id === 'coach')!.deletedAt = new Date()
      if (change === 'peer-changed') prisma.rows('conversationParticipant').find((row) => row.userId === 'player')!.userId = 'mum'
      return 0
    })
    await expect(service.authorizePrivateMediaRead('coach', CLUB, 'c1', prisma as never)).rejects.toThrow(ForbiddenException)
  })

  it('rejects an incorrect club before acquiring locks', async () => {
    const { service, prisma } = build((s) => conversation(s, 'c1', 'coach', 'player'))
    const lock = jest.spyOn(prisma, '$executeRaw')
    await expect(service.authorizePrivateMediaRead('coach', OTHER_CLUB, 'c1', prisma as never)).rejects.toThrow('does not belong')
    expect(lock).not.toHaveBeenCalled()
  })
})

describe('M1: a member removed from the club', () => {
  function removed() {
    return build((s) => {
      conversation(s, 'c1', 'coach', 'player')
      s.directMessage.push({ id: 'dm1', conversationId: 'c1', senderId: 'player', content: 'Bis Samstag', messageType: 'TEXT', attachmentUrl: null, attachmentMeta: null, replyToId: null, sourceLanguage: null, deletedAt: null, createdAt: new Date('2026-09-01') })
      // player left the club: membership gone, participant row kept.
      s.membership = s.membership.filter((m) => m.userId !== 'player')
    })
  }

  it('can no longer read, mark read or send', async () => {
    const { service } = removed()
    await expect(service.getMessages('player', 'c1')).rejects.toThrow('Not a member of this club')
    await expect(service.markAsRead('player', 'c1')).rejects.toThrow(ForbiddenException)
    await expect(service.saveMessage('player', 'c1', 'hi')).rejects.toThrow(ForbiddenException)
  })

  it('leaves the peer a read-only history that says they left', async () => {
    const { service } = removed()
    const page = await service.getMessages('coach', 'c1')
    expect(page.messages.map((m) => m.content)).toEqual(['Bis Samstag'])
    await expect(service.saveMessage('coach', 'c1', 'hi')).rejects.toThrow(ForbiddenException)
    await expect(service.getConversationDetail('coach', CLUB, 'c1')).resolves.toMatchObject({
      canMessage: false,
      peerLeftClub: true,
    })
  })
})

describe('DM attachments', () => {
  const keys = new Map<string, string>()
  const key = (cid: string, kind = 'image', club = CLUB) => {
    const id = JSON.stringify([cid, kind, club])
    if (!keys.has(id)) keys.set(id, newOwnedPrivateV1Key({ targetType: 'dm', clubId: club, targetId: cid,
      ownerId: 'coach', kind: kind as ChatUploadKind }, 'aufstellung.jpg'))
    return keys.get(id)!
  }
  const url = (cid: string, kind = 'image', club = CLUB) => `https://cdn.example/${key(cid, kind, club)}`

  function withConversation(mutate?: (s: Seed) => void, opts?: { r2?: Record<string, unknown> | null }) {
    return build((s) => {
      conversation(s, 'c1', 'coach', 'player')
      conversation(s, 'c-other', 'coach', 'mum')
      mutate?.(s)
    }, opts)
  }

  it('presigns only for participants, with the conversation-scoped key', async () => {
    const { service, r2 } = withConversation()
    await expect(
      service.presignMedia('outsider', CLUB, 'c1', { kind: 'image', contentType: 'image/jpeg', sizeBytes: 1000 }),
    ).rejects.toThrow(ForbiddenException)
    const ok = await service.presignMedia('coach', CLUB, 'c1', {
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      filename: 'Aufstellung Samstag.jpg',
    })
    expect(ok.objectKey).toMatch(/^dm\/club-1\/c1\/image\/private-v1-u[a-f0-9]{64}-[a-f0-9-]+-attachment$/)
    expect(r2!.presignPut).toHaveBeenCalledWith(ok.objectKey, 'image/jpeg', 1000, 300, expect.any(Date))
    await expect(
      service.presignMedia('coach', CLUB, 'c1', { kind: 'image', contentType: 'application/pdf', sizeBytes: 1000 }),
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.presignMedia('coach', CLUB, 'c1', { kind: 'image', contentType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024 }),
    ).rejects.toThrow('File exceeds the allowed size')
  })

  it('sends a validated photo and rejects an upload of another conversation', async () => {
    const { service, prisma, r2, events } = withConversation((seed) => {
      seed.accountMediaDeletion.push({ objectKey: key('c1'), uploadOwnerId: 'coach', uploadState: 'PENDING',
        uploadExpiresAt: new Date(Date.now() + 900_000) })
    })
    await expect(
      service.sendMessage('coach', CLUB, 'c1', { messageType: 'IMAGE', attachmentUrl: url('c-other') }),
    ).rejects.toThrow('Attachment does not belong to this conversation upload')
    expect(prisma.rows('directMessage')).toHaveLength(0)

    const item = await service.sendMessage('coach', CLUB, 'c1', {
      messageType: 'IMAGE',
      attachmentUrl: url('c1'),
      attachmentMeta: { width: 1200, height: 900 },
      clientMessageId: 'tmp-1',
    })
    expect(r2!.assertStoredObject).toHaveBeenCalledWith(key('c1'), expect.objectContaining({ maxBytes: 10 * 1024 * 1024 }))
    expect(item).toMatchObject({ messageType: 'IMAGE', attachmentMeta: { width: 1200, height: 900 } })
    expect(events.emit).toHaveBeenCalledWith('dm.message.created', { message: item, clientMessageId: 'tmp-1' })
  })

  it('rejects the other participant reposting the sender’s attachment', async () => {
    const { service, prisma } = withConversation()
    await expect(service.sendMessage('player', CLUB, 'c1', {
      messageType: 'IMAGE', attachmentUrl: url('c1'),
    })).rejects.toThrow('Attachment does not belong to this conversation upload')
    expect(prisma.rows('directMessage')).toHaveLength(0)
  })

  it('returns the original attachment after a lost response without sending twice', async () => {
    const { service, prisma, events } = withConversation((seed) => {
      seed.accountMediaDeletion.push({ objectKey: key('c1'), uploadOwnerId: 'coach', uploadState: 'PENDING',
        uploadExpiresAt: new Date(Date.now() + 900_000) })
    })
    const input = { messageType: 'IMAGE' as const, attachmentUrl: url('c1') }
    const original = await service.sendMessage('coach', CLUB, 'c1', input)
    const replay = await service.sendMessage('coach', CLUB, 'c1', input)
    expect(replay.id).toBe(original.id)
    expect(prisma.rows('directMessage')).toHaveLength(1)
    expect(events.emit).toHaveBeenCalledTimes(2)
    expect(events.emit.mock.calls.map((call: any[]) => call[0])).toEqual(['dm.message.created', 'dm.message.recovered'])
    await expect(service.sendMessage('coach', CLUB, 'c1', { ...input, content: 'different' }))
      .rejects.toThrow('Attachment has already been used')
  })

  it('refuses a stored object that fails inspection', async () => {
    const { service } = withConversation(undefined, {
      r2: { assertStoredObject: jest.fn().mockRejectedValue(new Error('too large')) },
    })
    await expect(
      service.sendMessage('coach', CLUB, 'c1', { messageType: 'VIDEO', attachmentUrl: url('c1', 'video') }),
    ).rejects.toThrow('Attachment upload is invalid or incomplete')
  })

  it('revalidates after the object lock and rejects an attachment retired after preflight', async () => {
    const validate = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('retired'))
    const { service, prisma } = withConversation(undefined, { r2: { assertStoredObject: validate } })
    const lock = jest.spyOn(prisma, '$executeRaw')
    await expect(service.sendMessage('coach', CLUB, 'c1', {
      messageType: 'IMAGE', attachmentUrl: url('c1'),
    })).rejects.toThrow('Attachment upload is invalid or incomplete')
    expect(prisma.rows('directMessage')).toHaveLength(0)
    const index = lock.mock.calls.findIndex((args) => (args as unknown[]).includes(`media-object:${key('c1')}`))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(validate.mock.invocationCallOrder[1]).toBeGreaterThan(lock.mock.invocationCallOrder[index])
  })

  it('rejects durable retirement intent even when storage still validates', async () => {
    const { service, prisma, r2 } = withConversation((seed) => {
      seed.accountMediaDeletion.push({ objectKey: key('c1') })
    })
    await expect(service.sendMessage('coach', CLUB, 'c1', {
      messageType: 'IMAGE', attachmentUrl: url('c1'),
    })).rejects.toThrow('Attachment is being removed; upload it again')
    expect(r2!.assertStoredObject).toHaveBeenCalledTimes(1)
    expect(prisma.rows('directMessage')).toHaveLength(0)
  })

  describe('signed media URL', () => {
    function withPhoto(mutate?: (s: Seed) => void) {
      return withConversation((s) => {
        s.directMessage.push({ id: 'photo', conversationId: 'c1', senderId: 'coach', content: '', messageType: 'IMAGE', attachmentUrl: url('c1'), attachmentMeta: null, replyToId: null, sourceLanguage: null, deletedAt: null, createdAt: new Date() })
        mutate?.(s)
      })
    }

    it('signs for a current participant', async () => {
      const { service, r2 } = withPhoto()
      await expect(service.getMediaUrl('player', CLUB, 'c1', 'photo')).resolves.toEqual({ url: 'https://signed.example/get' })
      expect(r2!.presignGet).toHaveBeenCalledWith(key('c1'), 3600)
    })

    it('403s a non-participant (even a club member)', async () => {
      const { service, r2 } = withPhoto()
      await expect(service.getMediaUrl('mum', CLUB, 'c1', 'photo')).rejects.toThrow(ForbiddenException)
      expect(r2!.presignGet).not.toHaveBeenCalled()
    })

    it('403s a participant who was removed from the club', async () => {
      const { service, r2 } = withPhoto((s) => {
        s.membership = s.membership.filter((m) => m.userId !== 'player')
      })
      await expect(service.getMediaUrl('player', CLUB, 'c1', 'photo')).rejects.toThrow(ForbiddenException)
      expect(r2!.presignGet).not.toHaveBeenCalled()
    })

    it('404s a message of another conversation and 403s a club mismatch', async () => {
      const { service } = withPhoto()
      await expect(service.getMediaUrl('coach', CLUB, 'c-other', 'photo')).rejects.toThrow(NotFoundException)
      await expect(service.getMediaUrl('coach', OTHER_CLUB, 'c1', 'photo')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('lineup cards', () => {
    function withEvent() {
      return withConversation((s) => {
        s.event.push({
          id: 'ev-1',
          clubId: CLUB,
          teamId: 'team-1',
          title: 'Heimspiel gegen SV Babelsberg 03',
          date: new Date(Date.now() + 3 * 24 * 3600 * 1000),
          opponent: 'SV Babelsberg 03',
          cancelledAt: null,
          archivedAt: null,
          lineup: {
            formation: '4-4-2',
            starters: [
              { name: 'Jonas Keller', position: 'TW' },
              { name: 'Lukas Hoffmann', position: 'ST' },
            ],
            bench: [],
          },
        })
      })
    }

    it('lets the team’s coach share an event lineup as a snapshot', async () => {
      const { service } = withEvent()
      const options = await service.listLineupOptions('coach', CLUB, 'c1')
      expect(options).toEqual([expect.objectContaining({ eventId: 'ev-1', formation: '4-4-2', starterCount: 2 })])
      const item = await service.sendMessage('coach', CLUB, 'c1', {
        messageType: 'LINEUP',
        lineup: { source: 'EVENT', eventId: 'ev-1' },
      })
      expect(item.attachmentMeta).toMatchObject({
        lineupSource: 'EVENT',
        eventId: 'ev-1',
        opponent: 'SV Babelsberg 03',
        formation: '4-4-2',
        slots: [
          { position: 'TW', playerName: 'Jonas Keller' },
          { position: 'ST', playerName: 'Lukas Hoffmann' },
        ],
      })
    })

    it('does not let a player share an event lineup, but they can share a formation card', async () => {
      const { service } = withEvent()
      expect(await service.listLineupOptions('player', CLUB, 'c1')).toEqual([])
      await expect(
        service.sendMessage('player', CLUB, 'c1', { messageType: 'LINEUP', lineup: { source: 'EVENT', eventId: 'ev-1' } }),
      ).rejects.toThrow(ForbiddenException)
      const card = await service.sendMessage('player', CLUB, 'c1', {
        messageType: 'LINEUP',
        lineup: { source: 'FORMATION', formation: '4-3-3', slots: [{ position: 'ST', playerName: 'Lukas' }] },
      })
      expect(card.attachmentMeta).toMatchObject({ lineupSource: 'FORMATION', formation: '4-3-3' })
    })

    it('does not let a TRIAL coach list or share a saved event lineup', async () => {
      const { service, prisma } = withEvent()
      const coachAccess = prisma.rows('teamAccess').find((row) => row.userId === 'coach')!
      coachAccess.phase = 'TRIAL'

      expect(await service.listLineupOptions('coach', CLUB, 'c1')).toEqual([])
      await expect(
        service.sendMessage('coach', CLUB, 'c1', {
          messageType: 'LINEUP',
          lineup: { source: 'EVENT', eventId: 'ev-1' },
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('rechecks saved-lineup authority after the coach-assignment lock', async () => {
      const { service, prisma } = withEvent()
      const locks: string[] = []
      jest.spyOn(prisma, '$executeRaw').mockImplementation(async (...query: unknown[]) => {
        const lockKey = String(query[1])
        locks.push(lockKey)
        if (lockKey.includes('coach-assignments:team-1')) {
          prisma.rows('teamAccess').find((row) => row.userId === 'coach')!.phase = 'TRIAL'
        }
        return 0
      })

      await expect(
        service.sendMessage('coach', CLUB, 'c1', {
          messageType: 'LINEUP',
          lineup: { source: 'EVENT', eventId: 'ev-1' },
        }),
      ).rejects.toThrow('Only the team’s coaches can share its lineup')
      expect(locks.slice(0, 5)).toEqual([
        'dm-user:coach',
        'dm-user:player',
        `owner:${CLUB}`,
        `dm-access:${CLUB}:coach`,
        `dm-access:${CLUB}:player`,
      ])
      expect(locks[5]).toBe('coach-assignments:team-1')
      expect(prisma.rows('directMessage')).toHaveLength(0)
    })
  })

  it('L5: a reply must quote a message of the same conversation', async () => {
    const { service } = withConversation((s) => {
      s.directMessage.push({ id: 'elsewhere', conversationId: 'c-other', senderId: 'mum', content: 'x', messageType: 'TEXT', attachmentUrl: null, attachmentMeta: null, replyToId: null, sourceLanguage: null, deletedAt: null, createdAt: new Date() })
      s.directMessage.push({ id: 'here', conversationId: 'c1', senderId: 'player', content: 'Wann Treffpunkt?', messageType: 'TEXT', attachmentUrl: null, attachmentMeta: null, replyToId: null, sourceLanguage: null, deletedAt: null, createdAt: new Date() })
    })
    await expect(
      service.saveMessage('coach', 'c1', { messageType: 'TEXT', content: 'ok', replyToId: 'elsewhere' }),
    ).rejects.toThrow('Invalid reply target')
    const reply = await service.saveMessage('coach', 'c1', { messageType: 'TEXT', content: '17:30', replyToId: 'here' })
    expect(reply.replyTo).toMatchObject({ id: 'here', contentPreview: 'Wann Treffpunkt?' })
  })

  it('reactions use the chat set and only the sender deletes', async () => {
    const { service } = withConversation((s) => {
      s.directMessage.push({ id: 'm1', conversationId: 'c1', senderId: 'player', content: 'Top', messageType: 'TEXT', attachmentUrl: null, attachmentMeta: null, replyToId: null, sourceLanguage: null, deletedAt: null, createdAt: new Date() })
    })
    await expect(service.setReaction('coach', CLUB, 'c1', 'm1', '💩', true)).rejects.toThrow(BadRequestException)
    const reacted = await service.setReaction('coach', CLUB, 'c1', 'm1', '⚽', true)
    expect(reacted.reactions).toEqual([{ emoji: '⚽', userIds: ['coach'], count: 1 }])
    await expect(service.setReaction('mum', CLUB, 'c1', 'm1', '👍', true)).rejects.toThrow(ForbiddenException)
    await expect(service.deleteMessage('coach', CLUB, 'c1', 'm1')).rejects.toThrow(ForbiddenException)
    const deleted = await service.deleteMessage('player', CLUB, 'c1', 'm1')
    expect(deleted).toMatchObject({ content: '', deletedAt: expect.any(String) })
  })

  it('returns the peer read watermark for ✓✓', async () => {
    const { service } = withConversation()
    const page = await service.getMessages('coach', 'c1')
    expect(page.peerLastReadAt).toBe('2026-09-20T10:00:00.000Z')
  })
})
