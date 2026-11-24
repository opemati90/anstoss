import { EventEmitter2 } from '@nestjs/event-emitter'
import type { PrismaService } from '../../prisma/prisma.service'
import type { OAuthProviderService } from './oauth.provider'
import { AppleNotificationController } from './apple-notification.controller'
import { AppleNotificationService } from './apple-notification.service'
import { APPLE_REVOCATION_MARKER } from './apple-session'

describe('Apple lifecycle notifications', () => {
  const env = { ...process.env }
  const eventTime = 1_800_000_000
  function setup() {
    const db = {
      $queryRaw: jest.fn(),
      authIdentityTombstone: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      socialIdentity: { findUnique: jest.fn().mockResolvedValue({ id: 'identity' }) },
    }
    const prisma = {
      ...db,
      $transaction: jest.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
    }
    const provider = {
      verifyAppleNotification: jest
        .fn()
        .mockResolvedValue({ type: 'consent-revoked', subject: 'subject', eventTime }),
    }
    const events = new EventEmitter2()
    jest.spyOn(events, 'emitAsync').mockResolvedValue([])
    const service = new AppleNotificationService(
      prisma as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
      events,
    )
    return {
      db,
      prisma,
      provider,
      events,
      service,
      controller: new AppleNotificationController(service),
    }
  }
  beforeEach(() => {
    process.env.AUTH_OTP_PEPPER = 'test-notification-pepper'
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('records a durable revocation before disconnecting related sockets', async () => {
    const { service, db, events } = setup()
    await expect(service.receive('signed-token')).resolves.toEqual({ ok: true })
    expect(db.authIdentityTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          provider: APPLE_REVOCATION_MARKER,
          subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          reason: 'consent-revoked',
          createdAt: new Date(eventTime * 1000),
        },
      }),
    )
    expect(events.emitAsync).toHaveBeenCalledWith('auth.apple.revoked', { identityId: 'identity' })
    expect(db.authIdentityTombstone.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(events.emitAsync).mock.invocationCallOrder[0],
    )
  })
  it.each([0, 100])(
    'does not rewind durable state on replay/older events (%s seconds)',
    async (offset) => {
      const { service, db, events } = setup()
      db.authIdentityTombstone.findUnique.mockResolvedValue({
        createdAt: new Date((eventTime + offset) * 1000),
      })
      await service.receive('signed-token')
      expect(db.authIdentityTombstone.upsert).not.toHaveBeenCalled()
      expect(events.emitAsync).toHaveBeenCalledTimes(1)
    },
  )
  it('stores revocation even if it arrives before the identity is linked', async () => {
    const { service, db, events } = setup()
    db.socialIdentity.findUnique.mockResolvedValue(null)
    await service.receive('signed-token')
    expect(db.authIdentityTombstone.upsert).toHaveBeenCalledTimes(1)
    expect(events.emitAsync).not.toHaveBeenCalled()
  })
  it.each(['email-disabled', 'email-enabled'])('does not revoke sessions for %s', async (type) => {
    const { service, provider, prisma } = setup()
    provider.verifyAppleNotification.mockResolvedValue({ type, subject: 'subject', eventTime })
    await service.receive('signed-token')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('does not acknowledge failed durable writes', async () => {
    const { service, db, events } = setup()
    db.authIdentityTombstone.upsert.mockRejectedValue(new Error('database unavailable'))
    await expect(service.receive('signed-token')).rejects.toThrow('database unavailable')
    expect(events.emitAsync).not.toHaveBeenCalled()
  })
  it('does not acknowledge a failed disconnect notification, allowing a retry', async () => {
    const { service, events } = setup()
    jest.mocked(events.emitAsync).mockRejectedValue(new Error('adapter unavailable'))
    await expect(service.receive('signed-token')).rejects.toThrow('adapter unavailable')
  })
  it.each([
    null,
    {},
    { payload: '' },
    { payload: 'x'.repeat(16_385) },
    { payload: 'token', extra: 'data' },
  ])('rejects malformed envelopes without calling the provider: %p', (body) => {
    const { controller, provider } = setup()
    expect(() => controller.receive(body)).toThrow('Invalid notification')
    expect(provider.verifyAppleNotification).not.toHaveBeenCalled()
  })
})
