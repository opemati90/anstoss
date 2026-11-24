import { createHash } from 'node:crypto'
import { TranslationService } from './translation.service'

describe('OpenAI chat translation', () => {
  const originalEnv = { ...process.env }
  let prisma: any
  let ai: any
  let service: TranslationService
  const output = (sourceLanguage = 'en', translation = 'Hallo') =>
    JSON.stringify({ sourceLanguage, translation })
  const consent = {
    createdAt: new Date('2026-02-01'),
    sender: { aiTranslationConsentAt: new Date('2026-01-01'), deletedAt: null },
  }

  beforeEach(() => {
    process.env.CHAT_TRANSLATION_ENABLED = 'true'
    process.env.CHAT_TRANSLATION_PROVIDER = 'openai'
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ aiTranslationConsentAt: new Date('2026-01-01'), deletedAt: null }),
      },
      message: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'm1',
            clubId: 'club1',
            sourceLanguage: 'en',
            editedAt: null,
            ...consent,
          }),
        updateMany: jest.fn(),
      },
      directMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', sourceLanguage: 'en', ...consent }),
        updateMany: jest.fn(),
      },
      messageTranslation: { findUnique: jest.fn().mockResolvedValue(null) },
      directMessageTranslation: { findUnique: jest.fn().mockResolvedValue(null) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    }
    prisma.$transaction = jest.fn((fn) => fn(prisma))
    ai = {
      isEnabled: jest.fn().mockReturnValue(true),
      generate: jest.fn().mockResolvedValue(output()),
    }
    service = new TranslationService(prisma, ai)
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it.each(['channel', 'dm'] as const)(
    'translates %s, detects source and checks active parent',
    async (surface) => {
      expect(
        await service.translateForReader(surface, 'm1', null, 'Hello', 'de-DE', 'reader'),
      ).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
      expect(ai.generate).toHaveBeenCalledTimes(1)
      expect(ai.generate.mock.calls[0][0]).toBe('TRANSLATION')
      expect(JSON.parse(ai.generate.mock.calls[0][2])).toEqual({
        targetLanguage: 'de',
        message: 'Hello',
      })
      const parent = surface === 'channel' ? prisma.message : prisma.directMessage
      expect(parent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1', content: 'Hello', deletedAt: null } }),
      )
      expect(parent.findFirst).toHaveBeenCalledTimes(4)
      expect(parent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1', content: 'Hello', deletedAt: null } }),
      )
      expect(String(prisma.$executeRaw.mock.calls[1][0])).toContain('"originalHash"')
      expect(String(prisma.$executeRaw.mock.calls[1][0])).toContain('"content" =')
    },
  )
  it('uses a matching cache without contacting the provider', async () => {
    prisma.messageTranslation.findUnique.mockResolvedValue({
      content: 'Hallo',
      sourceLanguage: 'en',
      originalHash: createHash('sha256').update('Hello').digest('hex'),
    })
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
    expect(ai.generate).not.toHaveBeenCalled()
  })
  it('never uses a translation of previous message contents', async () => {
    prisma.messageTranslation.findUnique.mockResolvedValue({
      content: 'Old',
      sourceLanguage: 'en',
      originalHash: 'wrong',
    })
    expect(
      (await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'))?.content,
    ).toBe('Hallo')
    expect(ai.generate).toHaveBeenCalledTimes(1)
  })
  it('redetects edited text even if the stored old language equals the target', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'm1',
      clubId: 'club1',
      sourceLanguage: 'de',
      editedAt: new Date(),
      ...consent,
    })
    expect(
      (await service.translateForReader('channel', 'm1', 'de', 'Hello', 'de', 'reader'))?.content,
    ).toBe('Hallo')
    expect(ai.generate).toHaveBeenCalledTimes(1)
  })
  it('does not translate a known same-language message', async () => {
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'en', 'reader'),
    ).toBeNull()
    expect(ai.generate).not.toHaveBeenCalled()
  })
  it('coalesces duplicate simultaneous readers', async () => {
    const result = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.translateForReader('channel', 'm1', null, 'Hello', 'de', 'reader'),
      ),
    )
    expect(result.every((r) => r?.content === 'Hallo')).toBe(true)
    expect(ai.generate).toHaveBeenCalledTimes(1)
  })
  it('refuses deleted or stale messages before provider egress', async () => {
    prisma.message.findFirst.mockResolvedValue(null)
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    expect(ai.generate).not.toHaveBeenCalled()
  })
  it('drops a translation if a delete races the provider', async () => {
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: 'm1', sourceLanguage: 'en', ...consent })
      .mockResolvedValue(null)
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it.each(['provider', 'database', 'invalidJson', 'unknownLanguage'])(
    'keeps original chat available when %s fails',
    async (failure) => {
      if (failure === 'provider') ai.generate.mockRejectedValue(new Error('unavailable'))
      if (failure === 'database')
        prisma.message.findFirst.mockRejectedValue(new Error('unavailable'))
      if (failure === 'invalidJson') ai.generate.mockResolvedValue('not json')
      if (failure === 'unknownLanguage') ai.generate.mockResolvedValue(output('other', ''))
      await expect(
        service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
      ).resolves.toBeNull()
    },
  )
  it('does not spend on automatic language detection at send time', async () => {
    expect(await service.detectAndPersistSource('channel', 'm1', 'Hello')).toBeNull()
    expect(ai.generate).not.toHaveBeenCalled()
  })
  it('requires an identified opted-in reader, even with a warm cache', async () => {
    expect(await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de')).toBeNull()
    prisma.user.findUnique.mockResolvedValue({ aiTranslationConsentAt: null, deletedAt: null })
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    expect(ai.generate).not.toHaveBeenCalled()
    expect(prisma.messageTranslation.findUnique).not.toHaveBeenCalled()
  })
  it.each(['channel', 'dm'] as const)(
    'requires %s sender consent and a message sent after opt-in',
    async (surface) => {
      const parent = surface === 'channel' ? prisma.message : prisma.directMessage
      for (const sender of [
        null,
        { aiTranslationConsentAt: null, deletedAt: null },
        { aiTranslationConsentAt: new Date('2026-03-01'), deletedAt: null },
        { aiTranslationConsentAt: new Date('2026-01-01'), deletedAt: new Date() },
      ]) {
        parent.findFirst.mockResolvedValue({
          id: 'm1',
          clubId: 'club1',
          sourceLanguage: 'en',
          createdAt: consent.createdAt,
          sender,
        })
        expect(
          await service.translateForReader(surface, 'm1', 'en', 'Hello', 'de', 'reader'),
        ).toBeNull()
      }
      expect(ai.generate).not.toHaveBeenCalled()
    },
  )
  it('does not let coalescing bypass a second reader’s opt-out', async () => {
    prisma.user.findUnique.mockImplementation(async ({ where }: any) => ({
      aiTranslationConsentAt: where.id === 'yes' ? new Date() : null,
      deletedAt: null,
    }))
    const results = await Promise.all(
      ['yes', 'no'].map((reader) =>
        service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', reader),
      ),
    )
    expect(results).toEqual([{ content: 'Hallo', sourceLanguage: 'en' }, null])
    expect(ai.generate).toHaveBeenCalledTimes(1)
  })
  it('drops the result when reader or sender revokes while the provider responds', async () => {
    ai.generate.mockImplementationOnce(async () => {
      prisma.user.findUnique.mockResolvedValue({ aiTranslationConsentAt: null, deletedAt: null })
      return output()
    })
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    prisma.user.findUnique.mockResolvedValue({
      aiTranslationConsentAt: new Date(),
      deletedAt: null,
    })
    ai.generate.mockImplementationOnce(async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'm1',
        sourceLanguage: 'en',
        ...consent,
        sender: { aiTranslationConsentAt: null, deletedAt: null },
      })
      return output()
    })
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'fr', 'reader'),
    ).toBeNull()
  })
  it('honors both translation and AI kill switches', async () => {
    ai.isEnabled.mockReturnValue(false)
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    ai.isEnabled.mockReturnValue(true)
    process.env.CHAT_TRANSLATION_ENABLED = 'false'
    service = new TranslationService(prisma, ai)
    expect(
      await service.translateForReader('channel', 'm1', 'en', 'Hello', 'de', 'reader'),
    ).toBeNull()
    expect(ai.generate).not.toHaveBeenCalled()
  })
})
