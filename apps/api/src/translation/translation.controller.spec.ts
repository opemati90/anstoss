import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AI_TRANSLATION_NOTICE_VERSION } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { ALLOW_WITHOUT_CONSENT_KEY } from '../auth/age-gate.guard'
import { TranslationController } from './translation.controller'

describe('AI translation consent endpoint', () => {
  const prisma = { $executeRaw: jest.fn() }
  const translation = { hasAiConsent: jest.fn(), isAiAvailable: jest.fn() }
  const controller = new TranslationController(prisma as never, translation as never)
  beforeEach(() => {
    jest.clearAllMocks()
    translation.hasAiConsent.mockResolvedValue(false)
    translation.isAiAvailable.mockReturnValue(true)
  })
  it('is session-authenticated and not exempt from the global age gate', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TranslationController)).toContain(ClerkAuthGuard)
    expect(Reflect.getMetadata(ALLOW_WITHOUT_CONSENT_KEY, TranslationController)).toBeUndefined()
    expect(Reflect.getMetadata(ALLOW_WITHOUT_CONSENT_KEY, controller.setPreference)).toBeUndefined()
  })
  it('only reads the authenticated user preference', async () => {
    expect(await controller.getPreference({ id: 'me' })).toEqual({
      enabled: false,
      available: true,
      noticeVersion: AI_TRANSLATION_NOTICE_VERSION,
    })
    expect(translation.hasAiConsent).toHaveBeenCalledWith('me')
  })
  it('enables without resetting an existing cutoff', async () => {
    await controller.setPreference(
      { id: 'me' },
      { enabled: true, noticeVersion: AI_TRANSLATION_NOTICE_VERSION },
    )
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([true, 'me'])
    expect(String(prisma.$executeRaw.mock.calls[0][0])).toContain('COALESCE')
    expect(String(prisma.$executeRaw.mock.calls[0][0])).toContain(
      "clock_timestamp() AT TIME ZONE 'UTC'",
    )
  })
  it('can revoke even when the provider is disabled', async () => {
    translation.isAiAvailable.mockReturnValue(false)
    await controller.setPreference(
      { id: 'me' },
      { enabled: false, noticeVersion: AI_TRANSLATION_NOTICE_VERSION },
    )
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([false, 'me'])
  })
  it.each([
    { enabled: true },
    { enabled: 'true', noticeVersion: AI_TRANSLATION_NOTICE_VERSION },
    { enabled: true, noticeVersion: 'old' },
    { enabled: true, noticeVersion: AI_TRANSLATION_NOTICE_VERSION, userId: 'someone-else' },
  ])('rejects an invalid notice or extra account fields: %j', async (body) => {
    await expect(controller.setPreference({ id: 'me' }, body)).rejects.toThrow()
    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })
})
