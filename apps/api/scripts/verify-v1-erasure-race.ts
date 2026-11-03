import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { UsersService } from '../src/users/users.service'
import { reservePrivateV1Upload } from '../src/media/private-v1-reservations'
import { newOwnedPrivateV1Key } from '../src/media/private-v1-owner'

function deferred() {
  let resolve!: () => void
  return { promise: new Promise<void>((done) => { resolve = done }), resolve: () => resolve() }
}

async function main() {
  process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true'
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  let releaseGate: () => void = () => undefined
  try {
    const [identity] = await db.$queryRaw<Array<{ database: string; data_dir: string }>>`
      SELECT current_database() AS database, current_setting('data_directory') AS data_dir
    `
    assert.equal(identity.database, 'anstoss_retention_test')
    assert.equal(identity.data_dir, `${url.searchParams.get('host')}/data`)
    const userId = `synthetic-${randomUUID()}`
    await db.user.create({ data: { id: userId, name: 'Synthetic erasure user', dateOfBirth: new Date('1990-01-01') } })
    const key = newOwnedPrivateV1Key({ targetType: 'chat', clubId: userId, targetId: userId,
      ownerId: userId, kind: 'image' }, 'pending.png')
    const acquired = deferred(), release = deferred(), deletionAttempting = deferred()
    releaseGate = release.resolve
    let reservationPid = 0, deletionPid = 0
    let intercepted = false
    const proxy = new Proxy(db, {
      get(target, property) {
        if (property !== '$transaction') {
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        }
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
          target.$transaction(async (tx) => callback(new Proxy(tx, {
            get(transaction, name) {
              const original = Reflect.get(transaction, name)
              if (name !== '$executeRaw') return typeof original === 'function' ? original.bind(transaction) : original
              return async (...args: unknown[]) => {
                const result = await Reflect.apply(original, transaction, args)
                if (!intercepted && args.includes(userId)) {
                  intercepted = true
                  const [row] = await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
                  reservationPid = row.pid
                  acquired.resolve()
                  await release.promise
                }
                return result
              }
            },
          })), { timeout: 20_000, ...options })
      },
    })
    const reservation = reservePrivateV1Upload(proxy as never, userId, key, { kind: 'image' })
    await acquired.promise
    const deletionProxy = new Proxy(db, {
      get(target, property) {
        if (property !== '$transaction') {
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        }
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
          target.$transaction(async (tx) => callback(new Proxy(tx, {
            get(transaction, name) {
              const original = Reflect.get(transaction, name)
              if (name !== '$executeRaw') return typeof original === 'function' ? original.bind(transaction) : original
              return async (...args: unknown[]) => {
                if (!deletionPid && args.includes(userId)) {
                  const [row] = await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
                  deletionPid = row.pid
                  deletionAttempting.resolve()
                }
                return Reflect.apply(original, transaction, args)
              }
            },
          })), { timeout: 20_000, ...options })
      },
    })
    const service = new UsersService(deletionProxy as never, {} as never, {} as never, {} as never, {} as never)
    const deleting = service.deleteAccount(userId)
    await deletionAttempting.promise
    let blocked = false
    for (let attempt = 0; attempt < 40; attempt++) {
      const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
        SELECT ${reservationPid}::integer = ANY(pg_blocking_pids(${deletionPid}::integer)) AS blocked
      `
      if (row.blocked) { blocked = true; break }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.ok(blocked, 'erasure must wait for the actual reservation transaction lock')
    release.resolve()
    await reservation
    await deleting
    const job = await db.accountMediaDeletion.findUniqueOrThrow({ where: { objectKey: key } })
    assert.equal(job.uploadOwnerId, null)
    assert.equal(job.uploadState, null)
    assert.equal(job.uploadRequestId, null)
    assert.ok(job.availableAt <= new Date())
    await assert.rejects(reservePrivateV1Upload(db as never, userId, `${key}-second`, {}), /Account unavailable/)
    process.stdout.write('PASS: account erasure waits for a reservation and transfers it to anonymous cleanup (local PostgreSQL).\n')
  } finally { releaseGate(); await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
