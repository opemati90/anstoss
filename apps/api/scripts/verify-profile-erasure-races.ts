import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { RegistrationRole } from '@anstoss/shared'
import { UsersService } from '../src/users/users.service'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId } from '../src/prisma/tenant.context'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function main() {
  // Hard stop before creating fixtures unless this is the disposable local DB.
  for (const raw of [process.env.DATABASE_URL, process.env.DATABASE_URL_DIRECT]) {
    const url = new URL(raw ?? '')
    assert.equal(url.hostname, 'localhost')
    assert.equal(url.port, '55442')
    assert.equal(url.pathname, '/anstoss_test')
    assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/)
  }
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const userIds = [randomUUID(), randomUUID()].map((id) => `profile-race-${id}`)
  const keys = userIds.map((id) => `users/${id}/avatar/${randomUUID()}.png`)
  let avatarGate: { started: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | null = null
  let lockGate: { acquired: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | null = null
  const storage = {
    enabled: true,
    objectKeyFromUrl: (url: string) => url.startsWith('https://synthetic.invalid/') ? url.slice('https://synthetic.invalid/'.length) : null,
    assertStoredObject: async () => {
      const current = avatarGate
      if (current) { avatarGate = null; current.started.resolve(); await current.release.promise }
    },
  }
  const proxied = new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') {
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
        target.$transaction(async (tx) => callback(new Proxy(tx, {
          get(transaction, property) {
            const original = Reflect.get(transaction, property)
            if (property !== '$executeRaw') return typeof original === 'function' ? original.bind(transaction) : original
            return async (...args: unknown[]) => {
              const result = await Reflect.apply(original, transaction, args)
              const current = lockGate
              if (current && args.includes(userIds[1])) {
                lockGate = null
                current.acquired.resolve()
                await current.release.promise
              }
              return result
            }
          },
        })), { timeout: 15_000, ...options })
    },
  })
  let dispatches = 0
  const invites = { validate: async () => ({}), redeem: async () => { dispatches++; return { ok: true } } }
  const service = new UsersService(proxied as never, {} as never, {} as never, invites as never, {} as never, storage as never)
  try {
    await db.user.createMany({ data: userIds.map((id) => ({ id, name: 'Synthetic', dateOfBirth: new Date('1990-02-01'), registrationRole: 'PLAYER' })) })
    // Erasure wins while onboarding is waiting on object validation.
    avatarGate = { started: deferred(), release: deferred() }
    const pending = avatarGate
    const onboarding = service.completeOnboarding(userIds[0], {
      registrationRole: RegistrationRole.PLAYER,
      profile: { displayName: 'Must not return', dateOfBirth: '1990-02-01', photoUrl: `https://synthetic.invalid/${keys[0]}` },
      join: { inviteCode: 'synthetic' },
    })
    await pending.started.promise
    await service.deleteAccount(userIds[0])
    pending.release.resolve()
    await assert.rejects(onboarding, /User not found/)
    assert.equal(dispatches, 0)
    const erasedFirst = await db.user.findUniqueOrThrow({ where: { id: userIds[0] } })
    assert.ok(erasedFirst.deletedAt)
    assert.equal(erasedFirst.name, 'Deleted User')
    assert.equal(erasedFirst.avatarUrl, null)

    // Profile update wins the account lock: erasure must then inventory that
    // final avatar and enqueue its cleanup before anonymizing the account.
    lockGate = { acquired: deferred(), release: deferred() }
    const held = lockGate
    const update = service.updateProfile(userIds[1], { name: 'Temporary', avatarUrl: `https://synthetic.invalid/${keys[1]}` })
    await held.acquired.promise
    const erase = service.deleteAccount(userIds[1])
    held.release.resolve()
    await update
    await erase
    const erasedSecond = await db.user.findUniqueOrThrow({ where: { id: userIds[1] } })
    assert.ok(erasedSecond.deletedAt)
    assert.equal(erasedSecond.name, 'Deleted User')
    assert.equal(erasedSecond.avatarUrl, null)
    assert.equal(await db.accountMediaDeletion.count({ where: { objectKey: keys[1] } }), 1)
    console.log('PASS: isolated PostgreSQL onboarding/erasure and profile/erasure ordering; current avatar enters the outbox and no invite is dispatched after erasure')
  } finally {
    avatarGate?.release.resolve()
    lockGate?.release.resolve()
    await db.accountMediaDeletion.deleteMany({ where: { objectKey: { in: keys } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error('Profile-erasure race verification failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
})
