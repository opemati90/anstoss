import { createHash } from 'node:crypto'
import { AiTextService } from '../ai/ai-text.service'
import { PrismaService } from '../prisma/prisma.service'
import { TranslationService } from './translation.service'

type Surface = 'channel' | 'dm'
type MessageQuery = { where: { id: string } }
type Deferred = {
  promise: Promise<string>
  resolve: (value: string) => void
  reject: (reason: Error) => void
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<string>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (condition()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  throw new Error('Mocked translation did not reach the expected concurrency state')
}

describe.each<Surface>(['channel', 'dm'])('OpenAI %s translation concurrency', (surface) => {
  const originalEnv = { ...process.env }
  const translated = JSON.stringify({ sourceLanguage: 'en', translation: 'Hallo' })
  const consent = { aiTranslationConsentAt: new Date('2026-01-01'), deletedAt: null }

  function fixture() {
    const deletedIds = new Set<string>()
    const providerRequests = new Map<string, Deferred>()
    const findFirst = jest.fn(async ({ where }: MessageQuery) =>
      deletedIds.has(where.id)
        ? null
        : {
            id: where.id,
            clubId: 'club1',
            sourceLanguage: 'en',
            editedAt: null,
            createdAt: new Date('2026-02-01'),
            sender: consent,
          },
    )
    const findUnique = jest.fn().mockResolvedValue(null)
    const transaction = { $executeRaw: jest.fn().mockResolvedValue(1) }
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(consent) },
      message: { findFirst, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      directMessage: { findFirst, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      messageTranslation: { findUnique },
      directMessageTranslation: { findUnique },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    }
    const ai = {
      isEnabled: jest.fn().mockReturnValue(true),
      generate: jest.fn((_purpose: string, _instructions: string, input: string) => {
        const request = deferred()
        const payload = JSON.parse(input) as { message: string }
        providerRequests.set(payload.message, request)
        return request.promise
      }),
    }
    const service = new TranslationService(
      prisma as unknown as PrismaService,
      ai as unknown as AiTextService,
    )
    const translate = (id: string) =>
      service.translateForReader(surface, id, 'en', `Hello ${id}`, 'de', 'reader1')
    const finish = (id: string) => {
      const request = providerRequests.get(`Hello ${id}`)
      if (!request) throw new Error(`Missing mocked provider request for ${id}`)
      request.resolve(translated)
    }
    return {
      service,
      prisma,
      ai,
      deletedIds,
      providerRequests,
      translate,
      finish,
      findUnique,
      findFirst,
    }
  }

  beforeEach(() => {
    process.env.CHAT_TRANSLATION_ENABLED = 'true'
    process.env.CHAT_TRANSLATION_PROVIDER = 'openai'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns eight warm cache hits while all four provider slots are occupied', async () => {
    const test = fixture()
    const activeIds = ['active1', 'active2', 'active3', 'active4']
    const active = activeIds.map(test.translate)
    await waitFor(() => test.ai.generate.mock.calls.length === 4)

    test.findUnique.mockImplementation(
      async (query: {
        where: {
          messageId_targetLanguage?: { messageId: string }
          directMessageId_targetLanguage?: { directMessageId: string }
        }
      }) => {
        const id =
          query.where.messageId_targetLanguage?.messageId ??
          query.where.directMessageId_targetLanguage?.directMessageId
        return {
          content: `Cached ${id}`,
          sourceLanguage: 'en',
          originalHash: createHash('sha256').update(`Hello ${id}`).digest('hex'),
        }
      },
    )
    const cachedIds = Array.from({ length: 8 }, (_, index) => `cached${index}`)
    const cached = await Promise.all(cachedIds.map(test.translate))

    expect(cached).toEqual(
      cachedIds.map((id) => ({ content: `Cached ${id}`, sourceLanguage: 'en' })),
    )
    expect(test.ai.generate).toHaveBeenCalledTimes(4)
    activeIds.forEach(test.finish)
    await Promise.all(active)
  })

  it('does not export a message deleted in the queue and passes its slot to the next request', async () => {
    const test = fixture()
    const activeIds = ['active1', 'active2', 'active3', 'active4']
    const active = activeIds.map(test.translate)
    await waitFor(() => test.ai.generate.mock.calls.length === 4)

    const deleted = test.translate('deleted-while-queued')
    const survivor = test.translate('survivor')
    await waitFor(() => test.findUnique.mock.calls.length === 6)
    // Let both cache-miss continuations join the provider queue before deleting.
    await new Promise<void>((resolve) => setImmediate(resolve))
    test.deletedIds.add('deleted-while-queued')
    test.finish('active1')

    expect(await deleted).toBeNull()
    await waitFor(() => test.providerRequests.has('Hello survivor'))
    expect(test.providerRequests.has('Hello deleted-while-queued')).toBe(false)
    expect(test.ai.generate).toHaveBeenCalledTimes(5)

    activeIds.slice(1).forEach(test.finish)
    test.finish('survivor')
    expect(await survivor).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
    await Promise.all(active)
  })

  it('releases a failed provider slot so a queued request and a subsequent request can finish', async () => {
    const test = fixture()
    const activeIds = ['active1', 'active2', 'active3', 'active4']
    const active = activeIds.map(test.translate)
    await waitFor(() => test.ai.generate.mock.calls.length === 4)
    const queued = test.translate('queued')
    await waitFor(() => test.findUnique.mock.calls.length === 5)
    await new Promise<void>((resolve) => setImmediate(resolve))

    test.providerRequests.get('Hello active1')!.reject(new Error('Provider unavailable'))
    await waitFor(() => test.providerRequests.has('Hello queued'))
    activeIds.slice(1).forEach(test.finish)
    test.finish('queued')

    expect((await Promise.all(active))[0]).toBeNull()
    expect(await queued).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
    const subsequent = test.translate('subsequent')
    await waitFor(() => test.providerRequests.has('Hello subsequent'))
    test.finish('subsequent')
    expect(await subsequent).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
    expect(test.ai.generate).toHaveBeenCalledTimes(6)
  })
})
