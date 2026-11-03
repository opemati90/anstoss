import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger } from '../src/assets/private-upload-ledger'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  const ledger = new PrivateUploadLedger()
  const clubId = `synthetic-${randomUUID()}`, ownerId = `synthetic-${randomUUID()}`
  const input = { clubId, ownerId, targetId: 'synthetic-conversation', targetType: 'DM' as const,
    contentType: 'image/png', expectedBytes: 42, reserveRequestId: randomUUID(), reservedMessageType: 'IMAGE' as const }
  const quotaKey = `private-upload-quota:${JSON.stringify([clubId, ownerId])}`
  let release!: () => void
  let ready!: (pid: number) => void
  const hold = new Promise<void>((resolve) => { release = resolve })
  const locked = new Promise<number>((resolve) => { ready = resolve })
  try {
    const blocker = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${quotaKey}))`
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      ready(row.pid)
      await hold
    }, { timeout: 20_000 })
    const pid = await locked
    const calls = [1, 2].map(() => db.$transaction((tx) => ledger.reserve(tx, input), { timeout: 20_000 }))
    for (const call of calls) void call.catch(() => undefined)
    try {
      let waiting = false
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await db.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT (count(*) >= 2) AS waiting FROM pg_stat_activity WHERE ${pid}::integer = ANY(pg_blocking_pids(pid))
        `
        if (row.waiting) { waiting = true; break }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      assert.ok(waiting, 'both requests must actually wait behind the shared quota lock')
    } finally { release() }
    await blocker
    const [first, second] = await Promise.all(calls)
    assert.equal(first.id, second.id)
    assert.equal(await db.privateMediaUpload.count({ where: { clubId, ownerId, reserveRequestId: input.reserveRequestId } }), 1)
    await assert.rejects(db.$transaction((tx) => ledger.reserve(tx, { ...input, expectedBytes: 43 })),
      (error: any) => error?.getStatus?.() === 409)
    process.stdout.write('PASS: concurrent retries returned one reservation and conflicting reuse was rejected.\n')
  } finally { release?.(); await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
