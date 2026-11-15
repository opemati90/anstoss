import { TranslationService } from './translation.service'

describe('TranslationService cache writes', () => {
  const originalUrl = process.env.LIBRETRANSLATE_URL
  const originalEnabled = process.env.CHAT_TRANSLATION_ENABLED
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.CHAT_TRANSLATION_ENABLED = 'true'
    process.env.LIBRETRANSLATE_URL = 'https://translate.test'
    global.fetch = jest.fn((url: string) => {
      if (url.endsWith('/detect')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ language: 'en', confidence: 0.99 }]),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ translatedText: 'Hallo' }),
      })
    }) as jest.Mock
  })

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.LIBRETRANSLATE_URL
    else process.env.LIBRETRANSLATE_URL = originalUrl
    if (originalEnabled === undefined) delete process.env.CHAT_TRANSLATION_ENABLED
    else process.env.CHAT_TRANSLATION_ENABLED = originalEnabled
    global.fetch = originalFetch
  })

  it.each([undefined, 'false'])('does not contact a configured provider when disabled (%s)', async (enabled) => {
    if (enabled === undefined) delete process.env.CHAT_TRANSLATION_ENABLED
    else process.env.CHAT_TRANSLATION_ENABLED = enabled
    const service = new TranslationService({} as any)
    for (const surface of ['channel', 'dm'] as const) {
      await expect(service.translateForReader(surface, 'msg-1', 'en', 'Hello', 'de')).resolves.toBeNull()
      await expect(service.detectAndPersistSource(surface, 'msg-1', 'Hello')).resolves.toBeNull()
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('writes channel translations only through an active-parent recheck', async () => {
    const prisma: any = {
      message: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      messageTranslation: { findUnique: jest.fn().mockResolvedValue(null) },
      $executeRaw: jest.fn().mockResolvedValue(0),
    }
    prisma.$transaction = jest.fn((operation: (tx: typeof prisma) => unknown) => operation(prisma))
    const service = new TranslationService(prisma)

    await expect(
      service.translateForReader('channel', 'msg-1', 'en', 'Hello', 'de'),
    ).resolves.toEqual({ content: 'Hallo', sourceLanguage: 'en' })

    expect(String(prisma.$executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock')
    expect(String(prisma.$executeRaw.mock.calls[0][1])).toContain('chat-message:msg-1')
    const sql = String(prisma.$executeRaw.mock.calls[1][0])
    expect(sql).toContain('"MessageTranslation"')
    expect(sql).toContain('"deletedAt" IS NULL')
    expect(sql).toContain('ON CONFLICT')
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('writes DM translations only through an active-parent recheck', async () => {
    const prisma: any = {
      directMessage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      directMessageTranslation: { findUnique: jest.fn().mockResolvedValue(null) },
      $executeRaw: jest.fn().mockResolvedValue(0),
    }
    prisma.$transaction = jest.fn((operation: (tx: typeof prisma) => unknown) => operation(prisma))
    const service = new TranslationService(prisma)

    await expect(service.translateForReader('dm', 'dm-1', 'en', 'Hello', 'de')).resolves.toEqual({
      content: 'Hallo',
      sourceLanguage: 'en',
    })

    expect(String(prisma.$executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock')
    expect(String(prisma.$executeRaw.mock.calls[0][1])).toContain('dm-message:dm-1')
    const sql = String(prisma.$executeRaw.mock.calls[1][0])
    expect(sql).toContain('"DirectMessageTranslation"')
    expect(sql).toContain('"deletedAt" IS NULL')
    expect(sql).toContain('ON CONFLICT')
    expect(prisma.$transaction).toHaveBeenCalled()
  })
})
