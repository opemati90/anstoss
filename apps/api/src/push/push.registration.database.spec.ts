import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import { PushRegistrationChangedException, PushService } from './push.service'

const url = process.env.BILLING_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/anstoss_billing_test' || parsed.search) {
    throw new Error('Push database tests require the dedicated localhost anstoss_billing_test database')
  }
}

;(url ? describe : describe.skip)('push registration leases with real PostgreSQL', () => {
  let db: PrismaClient
  let service: PushService
  let users: string[]
  let token: string
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } })
    service = new PushService(db as PrismaService)
  })
  beforeEach(async () => {
    users = [randomUUID(), randomUUID()]
    token = `ExponentPushToken[${randomUUID()}]`
    await db.user.createMany({ data: users.map(id => ({ id, name: 'Local push lease test' })) })
  })
  afterEach(async () => { await db.user.deleteMany({ where: { id: { in: users } } }) })
  afterAll(async () => { await db.$disconnect() })

  it('preserves a same-user renewed registration against delayed logout', async () => {
    const old = await service.registerToken(users[0], token, 'ios', null)
    const current = await service.registerToken(users[0], token, 'ios', old)
    expect(await service.removeToken(token, users[0], old)).toEqual({ count: 0 })
    expect((await db.pushToken.findUniqueOrThrow({ where: { token } })).updatedAt.toISOString()).toBe(current.updatedAt)
    expect(await service.removeToken(token, users[0], current)).toEqual({ count: 1 })
  })

  it('rejects delayed initial registration after a newer account owns the token', async () => {
    const current = await service.registerToken(users[1], token, 'android', null)
    try {
      await service.registerToken(users[0], token, 'android', null)
      throw new Error('Expected conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(PushRegistrationChangedException)
      expect((error as PushRegistrationChangedException).getResponse()).toEqual({
        code: 'push_registration_changed', registration: current,
      })
    }
    expect((await db.pushToken.findUniqueOrThrow({ where: { token } })).userId).toBe(users[1])
  })

  it('allows only one competing leased register and fences late retries and deletes', async () => {
    const old = await service.registerToken(users[0], token, 'ios', null)
    const results = await Promise.allSettled(users.map(userId => service.registerToken(userId, token, 'ios', old)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    await expect(service.registerToken(users[0], token, 'ios', old)).rejects.toBeInstanceOf(PushRegistrationChangedException)
    expect(await service.removeToken(token, users[0], old)).toEqual({ count: 0 })
  })

  it('advances the lease even when the clock has not advanced', async () => {
    const old = await service.registerToken(users[0], token, 'ios', null)
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(old.updatedAt))
    try {
      const next = await service.registerToken(users[0], token, 'ios', old)
      expect(Date.parse(next.updatedAt)).toBe(Date.parse(old.updatedAt) + 1)
      expect(await service.removeToken(token, users[0], old)).toEqual({ count: 0 })
    } finally { now.mockRestore() }
  })

  it('cannot revive a deleted lease or replace another user through the legacy protocol', async () => {
    const old = await service.registerToken(users[0], token, 'ios', null)
    await expect(service.registerToken(users[1], token, 'ios')).rejects.toBeInstanceOf(PushRegistrationChangedException)
    expect(await service.removeToken(token, users[0])).toEqual({ count: 0 })
    await service.removeToken(token, users[0], old)
    await expect(service.registerToken(users[0], token, 'ios', old)).rejects.toBeInstanceOf(PushRegistrationChangedException)
    expect(await db.pushToken.findUnique({ where: { token } })).toBeNull()
  })
})
