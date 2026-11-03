import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { isOwnedPrivateV1Key } from '../src/media/private-v1-owner'

// Metadata and aggregate counts only. No writes, user identifiers, object keys,
// credential values or URLs are printed. This does not establish a write fence.
async function main() {
  assert.equal(process.argv[2], '--production-readonly')
  const canaryIds: string[] = []
  for (let i = 3; i < process.argv.length; i += 2) {
    assert.equal(process.argv[i], '--canary-id')
    const id = process.argv[i + 1]
    assert.match(id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    canaryIds.push(id)
  }
  const env = { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.3.7', RAILWAY_AGENT_SESSION: 'anstoss-media-20261102' }
  const railway = (...args: string[]) => JSON.parse(execFileSync('/opt/homebrew/bin/railway', args,
    { encoding: 'utf8', env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }))
  const project = railway('status', '--json')
  assert.equal(project.id, 'fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4')
  const api = railway('variable', 'list', '--service', '373adb45-3ab1-4076-b2b9-72f1590ba1b3', '--environment', 'production', '--json')
  const postgres = railway('variable', 'list', '--service', 'a04d6695-4b78-42c2-947c-0713337a7762', '--environment', 'production', '--json')
  const apiDb = new URL(api.DATABASE_URL)
  const internalDb = new URL(postgres.DATABASE_URL)
  const publicDb = new URL(postgres.DATABASE_PUBLIC_URL)
  // Hostnames differ for Railway internal and public access. Credentials and
  // database must match all three before touching the public connection.
  for (const part of ['username', 'password', 'pathname'] as const) {
    assert.equal(apiDb[part], internalDb[part])
    assert.equal(apiDb[part], publicDb[part])
  }
  assert.equal(apiDb.hostname, internalDb.hostname)
  const db = new PrismaClient({ datasources: { db: { url: publicDb.href } } })
  try {
    const snapshot = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const counts = await tx.$queryRaw<Array<{ channel: bigint; dm: bigint; channel_evidence: bigint; dm_evidence: bigint }>>`
        SELECT (SELECT count(*) FROM "Message" WHERE "attachmentUrl" IS NOT NULL) AS channel,
               (SELECT count(*) FROM "DirectMessage" WHERE "attachmentUrl" IS NOT NULL) AS dm,
               (SELECT count(*) FROM "MessageReport" WHERE "evidenceAttachmentUrl" IS NOT NULL) AS channel_evidence,
               (SELECT count(*) FROM "DirectMessageReport" WHERE "evidenceAttachmentUrl" IS NOT NULL) AS dm_evidence
      `
      const tables = await tx.$queryRaw<Array<{ name: string; estimated_rows: number; total_bytes: bigint }>>`
        SELECT c.relname AS name, c.reltuples::float8 AS estimated_rows,
          pg_total_relation_size(c.oid) AS total_bytes
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND c.relname IN ('Message', 'DirectMessage') AND c.relkind = 'r'
        ORDER BY c.relname
      `
      return { counts, tables }
    }, { isolationLevel: 'RepeatableRead', timeout: 30_000 })
    assert.equal(api.R2_QUARANTINE_JURISDICTION, 'eu')
    assert.ok(api.R2_ACCOUNT_ID && api.R2_ACCESS_KEY_ID && api.R2_SECRET_ACCESS_KEY && api.R2_QUARANTINE_BUCKET
      && api.R2_QUARANTINE_ACCESS_KEY_ID && api.R2_QUARANTINE_SECRET_ACCESS_KEY)
    const buckets = [
      { bucket: api.R2_BUCKET_NAME || 'anstoss-assets', endpoint: `https://${api.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: api.R2_ACCESS_KEY_ID, secretAccessKey: api.R2_SECRET_ACCESS_KEY },
      { bucket: api.R2_QUARANTINE_BUCKET, endpoint: `https://${api.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
        accessKeyId: api.R2_QUARANTINE_ACCESS_KEY_ID, secretAccessKey: api.R2_QUARANTINE_SECRET_ACCESS_KEY },
    ]
    assert.notEqual(buckets[0].bucket, buckets[1].bucket)
    const storage: Array<{ location: string; prefix: string; objects: number; bytes: number; knownCanaryObjects: number }> = []
    for (const [index, bucket] of buckets.entries()) {
      const client = new S3Client({ region: 'auto', endpoint: bucket.endpoint,
        credentials: { accessKeyId: bucket.accessKeyId, secretAccessKey: bucket.secretAccessKey }, maxAttempts: 1 })
      try {
        for (const prefix of ['chat/', 'dm/', 'private-chat/v2/']) {
          let continuation: string | undefined
          let objects = 0, bytes = 0, knownCanaryObjects = 0
          const seen = new Set<string>()
          do {
            const page = await client.send(new ListObjectsV2Command({ Bucket: bucket.bucket, Prefix: prefix, ContinuationToken: continuation }),
              { abortSignal: AbortSignal.timeout(30_000) })
            objects += page.Contents?.length ?? 0
            bytes += page.Contents?.reduce((total, item) => total + (item.Size ?? 0), 0) ?? 0
            if (canaryIds.length && index === 1 && (prefix === 'chat/' || prefix === 'dm/')) {
              const targetType = prefix === 'chat/' ? 'chat' as const : 'dm' as const
              knownCanaryObjects += page.Contents?.filter((item) => item.Key && item.Size === 0
                && item.Key.endsWith('-canary.png') && canaryIds.some((id) => {
                  const base = `canary-${id}`
                  const targets = targetType === 'chat' ? [base, `${base}-team`] : [`${base}-conversation`]
                  return targets.some((targetId) => isOwnedPrivateV1Key(item.Key!, {
                    targetType, clubId: base, targetId, ownerId: base, kind: 'image',
                  }))
                })).length ?? 0
            }
            if (!page.IsTruncated) { continuation = undefined; break }
            if (!page.NextContinuationToken || seen.has(page.NextContinuationToken)) throw new Error('Storage listing was incomplete')
            continuation = page.NextContinuationToken
            seen.add(continuation)
            if (seen.size > 10_000) throw new Error('Storage listing exceeded safety bound')
          } while (continuation)
          storage.push({ location: index === 0 ? 'public-assets' : 'private-media', prefix, objects, bytes, knownCanaryObjects })
        }
      } finally { client.destroy() }
    }
    process.stdout.write(`${JSON.stringify({ asOf: new Date().toISOString(), writeFence: false,
      database: Object.fromEntries(Object.entries(snapshot.counts[0]).map(([key, value]) => [key, Number(value)])),
      tableEstimates: snapshot.tables.map((table) => ({ name: table.name, estimatedRows: table.estimated_rows,
        totalBytes: Number(table.total_bytes) })), storage })}\n`)
  } finally { await db.$disconnect() }
}
main().catch(() => { process.stderr.write('Production media inventory failed safely; no credentials or object names printed.\n'); process.exitCode = 1 })
