import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { R2Provider } from '../src/assets/r2.provider'
import { isOwnedPrivateV1Key, newOwnedPrivateV1Key } from '../src/media/private-v1-owner'

/** Synthetic object only. On any uncertain outcome, preserve it for review. */
async function main() {
  assert.equal(process.argv[2], '--synthetic-private-v1')
  const env = { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.3.7', RAILWAY_AGENT_SESSION: 'anstoss-media-20261102' }
  const railway = (...args: string[]) => JSON.parse(execFileSync('/opt/homebrew/bin/railway', args,
    { encoding: 'utf8', env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }))
  assert.equal(railway('status', '--json').id, 'fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4')
  const config = railway('variable', 'list', '--service', '373adb45-3ab1-4076-b2b9-72f1590ba1b3', '--environment', 'production', '--json')
  const variables = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
    'R2_QUARANTINE_BUCKET', 'R2_QUARANTINE_ACCESS_KEY_ID', 'R2_QUARANTINE_SECRET_ACCESS_KEY', 'R2_QUARANTINE_JURISDICTION']
  for (const name of variables) assert.ok(config[name], `Required storage setting missing: ${name}`)
  assert.equal(config.R2_QUARANTINE_JURISDICTION, 'eu')
  assert.notEqual(config.R2_BUCKET_NAME, config.R2_QUARANTINE_BUCKET)
  assert.match(config.R2_ACCOUNT_ID, /^[0-9a-f]{32}$/i)
  for (const name of variables) process.env[name] = config[name]

  const id = randomUUID()
  const scope = { targetType: 'chat' as const, clubId: `canary-${id}`, targetId: `canary-${id}`,
    ownerId: `canary-${id}`, kind: 'image' as const }
  const key = newOwnedPrivateV1Key(scope, 'canary.png')
  assert.ok(key.startsWith(`chat/canary-${id}/canary-${id}/image/private-v1-u`))
  assert.ok(isOwnedPrivateV1Key(key, scope))
  process.stdout.write(`Synthetic private-media canary ID: ${id}\n`)
  const client = new S3Client({ region: 'auto', endpoint: `https://${config.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_QUARANTINE_ACCESS_KEY_ID, secretAccessKey: config.R2_QUARANTINE_SECRET_ACCESS_KEY }, maxAttempts: 1 })
  const deadline = () => AbortSignal.timeout(30_000)
  try {
    const marker = `retired-chat/${createHash('sha256').update(key).digest('hex')}`
    for (const candidate of [key, marker]) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.R2_QUARANTINE_BUCKET, Key: candidate }), { abortSignal: deadline() })
        throw new Error('Synthetic key unexpectedly exists')
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error
      }
    }
    const r2 = new R2Provider()
    const { uploadUrl, publicUrl } = await r2.presignPut(key, 'image/png', 4, 300, new Date())
    assert.equal(publicUrl, `https://private-media.anstoss.invalid/${key}`)
    const put = () => fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png', 'Content-Length': '4',
      'If-None-Match': '*' }, body: new Uint8Array([1, 2, 3, 4]), signal: deadline() })
    assert.equal((await put()).status, 200)
    const read = await fetch(await r2.presignGet(key, 60), { signal: deadline() })
    assert.equal(read.status, 200)
    assert.deepEqual([...new Uint8Array(await read.arrayBuffer())], [1, 2, 3, 4])
    assert.equal((await put()).status, 412)
    // This writes only a tombstone for the freshly generated synthetic key,
    // and a deterministic retirement marker. Both remain on purpose.
    await r2.deleteObjects([key])
    const tombstone = await client.send(new HeadObjectCommand({ Bucket: config.R2_QUARANTINE_BUCKET, Key: key }), { abortSignal: deadline() })
    assert.equal(tombstone.ContentLength, 0)
    assert.equal(tombstone.ContentType, 'application/x-anstoss-removed')
    const receipt = await client.send(new HeadObjectCommand({ Bucket: config.R2_QUARANTINE_BUCKET, Key: marker }), { abortSignal: deadline() })
    assert.equal(receipt.ContentLength, 0)
    assert.equal(receipt.Metadata?.source, undefined)
    assert.ok(receipt.Metadata?.retiredat)
    assert.equal((await put()).status, 412)
    process.stdout.write(`PASS: private R2 v1 PUT, GET and conditional retirement; synthetic canary ${id} retained.\n`)
  } finally { client.destroy() }
}
main().catch(() => { process.stderr.write('Private R2 canary failed or was uncertain; no further cleanup attempted.\n'); process.exitCode = 1 })
