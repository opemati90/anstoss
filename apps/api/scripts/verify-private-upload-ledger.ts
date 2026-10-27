import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger } from '../src/assets/private-upload-ledger'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(
    url.searchParams.get('host') ?? '',
    /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/,
  )
  const prisma = new PrismaClient()
  prisma.$use(createTenantMiddleware(getClubId) as never)
  const ledger = new PrivateUploadLedger()
  const clubId = `upload-test-${randomUUID()}`
  const ownerId = `upload-test-${randomUUID()}`
  try {
    await tenantContext.run({ clubId, userId: ownerId }, async () => {
      const intent = await prisma.$transaction((tx) =>
        ledger.reserve(tx, {
          clubId,
          ownerId,
          targetId: 'synthetic-channel',
          targetType: 'CHANNEL',
          contentType: 'image/png',
          expectedBytes: 42,
        }),
      )
      const scope = { id: intent.id, clubId, ownerId }
      const claims = await Promise.all(
        Array.from({ length: 8 }, () =>
          prisma.$transaction((tx) => ledger.begin(tx, scope, 'initiate'), { maxWait: 10_000 }),
        ),
      )
      const winners = claims.filter((claim) => claim !== null)
      assert.equal(winners.length, 1, 'Only one replica can initiate storage')
      await assert.rejects(
        prisma.$transaction((tx) => ledger.cancel(tx, { ...scope, clubId: 'other-club' })),
        /tenant mismatch/,
      )
      assert.equal(
        await prisma.$transaction((tx) => ledger.cancel(tx, { ...scope, ownerId: 'other-owner' })),
        false,
      )

      // Simulate process restart by using a new ledger after cancellation.
      await prisma.$transaction((tx) => ledger.cancel(tx, scope))
      const restarted = new PrivateUploadLedger()
      assert.equal(await prisma.$transaction((tx) => restarted.begin(tx, scope, 'initiate')), null)
      assert.equal(
        await prisma.$transaction((tx) =>
          restarted.settle(tx, scope, 'initiate', winners[0]!.operationId, 'provider-upload'),
        ),
        true,
      )
      assert.equal(await prisma.$transaction((tx) => restarted.begin(tx, scope, 'complete')), null)
      const abort = await prisma.$transaction((tx) => restarted.begin(tx, scope, 'abort'))
      assert.ok(abort)
      assert.equal(
        await prisma.$transaction((tx) => restarted.settle(tx, scope, 'abort', abort.operationId)),
        true,
      )
      assert.equal(
        (await prisma.privateMediaUpload.findFirstOrThrow({ where: scope })).state,
        'REMOVED',
      )

      const before = await prisma.privateMediaUpload.count({ where: { clubId, ownerId } })
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await ledger.reserve(tx, {
            clubId,
            ownerId,
            targetId: 'rollback',
            targetType: 'DM',
            contentType: 'image/png',
            expectedBytes: 42,
          })
          throw new Error('synthetic rollback')
        }),
        /synthetic rollback/,
      )
      assert.equal(await prisma.privateMediaUpload.count({ where: { clubId, ownerId } }), before)
    })
  } finally {
    try {
      await tenantContext.run({ clubId, userId: ownerId }, async () => {
        await prisma.privateMediaUpload.deleteMany({ where: { clubId, ownerId } })
      })
    } finally {
      await prisma.$disconnect()
    }
  }
  console.log(
    'PASS: local PostgreSQL upload ledger: one of eight claims, tenant/owner isolation, restart cancellation, rollback, fixture cleanup',
  )
}

void main().catch(() => {
  console.error('Private upload ledger verification failed')
  process.exitCode = 1
})
