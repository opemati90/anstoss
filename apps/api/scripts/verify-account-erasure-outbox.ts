import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { UnauthorizedException } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { UsersService } from '../src/users/users.service'
import { AccountMediaDeletionWorker } from '../src/assets/account-media-deletion.worker'
import { lockMediaObject } from '../src/assets/media-object-lock'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { signSessionToken } from '../src/auth/otp/jwt.util'

// This fixture is deliberately limited to disposable local Unix-socket DBs.
// Never run against staging/production or a normal developer database.
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(
    url.searchParams.get('host') ?? '',
    /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/,
  )
  const prisma = new PrismaClient()
  const previousSecret = process.env.AUTH_JWT_SECRET
  process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex')
  const id = `erasure-${randomUUID()}`
  const objectKey = `users/${id}/avatar.png`
  let storageFails = true
  const storage = {
    objectKeyFromUrl: (value: string) =>
      value === `https://synthetic.invalid/${objectKey}` ? objectKey : null,
    deleteObjects: async () => {
      if (storageFails) throw new Error('synthetic outage')
    },
  }
  try {
    await prisma.user.create({
      data: {
        id,
        name: 'Synthetic erasure fixture',
        avatarUrl: `https://synthetic.invalid/${objectKey}`,
      },
    })
    const token = signSessionToken(id)
    const guard = new ClerkAuthGuard(prisma as never)
    const context = () => ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
      }),
    })
    assert.equal(await guard.canActivate(context() as never), true)
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
    )
    await service.deleteAccount(id)
    await assert.rejects(
      () => guard.canActivate(context() as never),
      (error: unknown) => error instanceof UnauthorizedException && error.getStatus() === 401,
    )
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id } })
    assert.ok(deleted.deletedAt)
    assert.equal(deleted.avatarUrl, null)
    assert.equal(deleted.name, 'Deleted User')
    assert.equal(await prisma.accountMediaDeletion.count({ where: { objectKey } }), 1)
    await new AccountMediaDeletionWorker(prisma as never, storage as never).runCycle()
    const failed = await prisma.accountMediaDeletion.findUniqueOrThrow({ where: { objectKey } })
    assert.equal(failed.attempts, 1)
    assert.ok(failed.lastFailureAt)
    storageFails = false
    await prisma.accountMediaDeletion.update({
      where: { objectKey },
      data: { availableAt: new Date(0) },
    })
    await new AccountMediaDeletionWorker(prisma as never, storage as never).runCycle()
    assert.equal(await prisma.accountMediaDeletion.count({ where: { objectKey } }), 0)
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id } })).deletedAt)
    let signalLocked!: () => void
    let release!: () => void
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve
    })
    const releaseLock = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = prisma.$transaction(
      async (tx) => {
        await lockMediaObject(tx, objectKey)
        signalLocked()
        await releaseLock
      },
      { timeout: 10_000 },
    )
    // If setup fails, surface that failure instead of waiting indefinitely.
    await Promise.race([locked, first])
    try {
      await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ acquired: boolean }>
          >`SELECT pg_try_advisory_xact_lock(hashtext(${`media-object:${objectKey}`})) AS acquired`
          assert.equal(rows[0].acquired, false)
          release()
          await lockMediaObject(tx, objectKey)
        },
        { timeout: 10_000 },
      )
    } finally {
      release()
      await first
    }
    process.stdout.write(
      'PASS: real PostgreSQL account anonymization, atomic outbox, outage persistence, restart retry and acknowledgment. Storage mocked; no live account or file touched.\n',
    )
    process.stdout.write(
      'PASS: separate PostgreSQL transactions exclude one another on the shared media-object lock and acquire it after release.\n',
    )
    process.stdout.write(
      'PASS: the real authentication guard accepts the signed token before deletion and rejects that same token with 401 afterward. No HTTP listener or device tested.\n',
    )
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_JWT_SECRET
    else process.env.AUTH_JWT_SECRET = previousSecret
    await prisma.$disconnect()
  }
}

void main().catch(() => {
  process.stderr.write('Local erasure verification failed.\n')
  process.exitCode = 1
})
