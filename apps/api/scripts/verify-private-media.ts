import { randomUUID, createHash } from 'crypto'
import { R2Provider } from '../src/assets/r2.provider'

/** Explicit synthetic canary. Never enumerates or mutates user objects. */
export async function runPrivateMediaCanary() {
  if (process.env.RUN_PRIVATE_MEDIA_CANARY !== '1') throw new Error('Canary not explicitly enabled')
  const bucket = process.env.R2_QUARANTINE_BUCKET
  if (bucket !== 'anstoss-quarantine' || process.env.R2_QUARANTINE_JURISDICTION !== 'eu') {
    throw new Error('Unexpected private storage context')
  }
  const id = randomUUID()
  const key = `chat/release-canary/${id}/file/private-v1-${id}.pdf`
  const marker = `retired-chat/${createHash('sha256').update(key).digest('hex')}`
  const evidence = `quarantine/${createHash('sha256').update(`${bucket}/${key}`).digest('hex')}/private-v1-${id}.pdf`
  const provider = new R2Provider()
  const payload = Buffer.from('%PDF-1.0\nAnstoss synthetic private-media canary\n%%EOF\n')
  const checks: string[] = []
  const httpStatus: Record<string, number> = {}
  const requireCheck = (condition: boolean, label: string) => {
    if (!condition) throw new Error(label)
    checks.push(label)
  }
  let failed = false
  try {
    const intent = await provider.presignPut(key, 'application/pdf', payload.length)
    requireCheck(
      intent.publicUrl === `https://private-media.anstoss.invalid/${key}`,
      'non_public_reference',
    )
    const put = () =>
      fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'If-None-Match': '*' },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      })
    requireCheck((await put()).ok, 'conditional_upload')
    await provider.assertStoredObject(key, {
      maxBytes: 1024,
      allowedContentTypes: new Set(['application/pdf']),
    })
    checks.push('stored_object_validation')
    const signed = await provider.presignGet(key)
    const get = await fetch(signed, { signal: AbortSignal.timeout(15_000) })
    requireCheck(get.ok && (await get.text()) === payload.toString(), 'signed_read')
    const anonymous = new URL(signed)
    anonymous.search = ''
    const denied = await fetch(anonymous, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
    httpStatus.unsignedS3Read = denied.status
    // R2's S3 endpoint may reject missing signature parameters with 400.
    // This proves only endpoint rejection, not r2.dev/custom-domain policy.
    requireCheck([400, 401, 403, 404].includes(denied.status), 'unsigned_s3_request_rejected')
    requireCheck((await put()).status === 412, 'overwrite_rejected')
    const preserved = await provider.quarantineObject(key)
    requireCheck(preserved?.bucket === bucket && preserved?.key === evidence, 'private_quarantine')
    const evidenceGet = await fetch(await provider.presignGetIn(bucket, evidence), {
      signal: AbortSignal.timeout(15_000),
    })
    requireCheck(
      evidenceGet.ok && (await evidenceGet.text()) === payload.toString(),
      'evidence_preserved',
    )
    const removed = await fetch(signed, { signal: AbortSignal.timeout(15_000) })
    requireCheck(
      removed.ok && (await removed.arrayBuffer()).byteLength === 0,
      'original_bytes_removed',
    )
    requireCheck((await put()).status === 412, 'post_removal_replay_rejected')
    let validationRejected = false
    try {
      await provider.assertStoredObject(key, {
        maxBytes: 1024,
        allowedContentTypes: new Set(['application/pdf']),
      })
    } catch (error) {
      validationRejected =
        error instanceof Error && error.message === 'Uploaded file exceeds the allowed size'
    }
    requireCheck(validationRejected, 'removed_object_cannot_be_attached')
  } catch {
    failed = true
  } finally {
    // These exact three keys are deterministically derived from this run's UUID.
    // Do not call prefix deletion or the general cleanup sweep in this canary.
    const cleanup = await Promise.allSettled(
      [key, marker, evidence].map((objectKey) => provider.deleteObjectIn(bucket, objectKey)),
    )
    const absence = await Promise.allSettled(
      [key, marker, evidence].map(async (objectKey) => {
        const response = await fetch(await provider.presignGetIn(bucket, objectKey), {
          signal: AbortSignal.timeout(15_000),
        })
        await response.body?.cancel()
        return response.status === 404
      }),
    )
    const cleanupComplete =
      cleanup.every((result) => result.status === 'fulfilled') &&
      absence.every((result) => result.status === 'fulfilled' && result.value)
    process.stdout.write(
      `${JSON.stringify({ passed: !failed && cleanupComplete, checks, httpStatus, cleanupComplete })}\n`,
    )
    if (failed || !cleanupComplete) process.exitCode = 1
  }
}

if (require.main === module)
  void runPrivateMediaCanary().catch(() => {
    process.stderr.write(
      'Private-media canary did not start: check explicit enablement and storage configuration.\n',
    )
    process.exitCode = 1
  })
