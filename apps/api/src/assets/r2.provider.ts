import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { createHash } from 'crypto'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class R2Provider {
  private readonly logger = new Logger(R2Provider.name)
  private readonly client: S3Client | null
  private readonly quarantineClient: S3Client | null
  private readonly bucket: string
  private readonly quarantineBucket: string | null
  private readonly publicBaseUrl: string | null

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    this.bucket = process.env.R2_BUCKET_NAME || 'anstoss-assets'
    this.quarantineBucket = process.env.R2_QUARANTINE_BUCKET || null
    this.publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || null

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
    } else {
      this.logger.warn('R2 credentials not configured — uploads disabled')
      this.client = null
    }

    const quarantineAccessKeyId = process.env.R2_QUARANTINE_ACCESS_KEY_ID
    const quarantineSecretAccessKey = process.env.R2_QUARANTINE_SECRET_ACCESS_KEY
    const jurisdiction = process.env.R2_QUARANTINE_JURISDICTION
    if (this.quarantineBucket && accountId && quarantineAccessKeyId && quarantineSecretAccessKey && jurisdiction) {
      this.quarantineClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: quarantineAccessKeyId,
          secretAccessKey: quarantineSecretAccessKey,
        },
      })
    } else {
      this.quarantineClient = null
      if (this.quarantineBucket) {
        this.logger.error('R2 quarantine bucket is set but its endpoint or credentials are missing')
      }
    }
  }

  get enabled(): boolean {
    return !!this.client
  }

  private isPrivateChatKey(key: string): boolean {
    return /^(chat|dm)\/[^/]+\/[^/]+\/(voice|image|video|file)\/private-v1-[^/]+$/.test(key)
  }

  private objectStorage(key: string): { client: S3Client; bucket: string } {
    if (this.isPrivateChatKey(key)) {
      if (!this.quarantineClient || !this.quarantineBucket || this.quarantineBucket === this.bucket) {
        throw new Error('Private chat storage is not configured')
      }
      return { client: this.quarantineClient, bucket: this.quarantineBucket }
    }
    if (!this.client) throw new Error('R2 not configured')
    return { client: this.client, bucket: this.bucket }
  }

  async presignPut(
    objectKey: string,
    contentType: string,
    contentLength?: number,
    expiresIn = 600,
  ): Promise<{ uploadUrl: string; publicUrl: string | null }> {
    if (!this.client) {
      throw new Error('R2 not configured')
    }

    const storage = this.objectStorage(objectKey)
    const privateChat = this.isPrivateChatKey(objectKey)
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: objectKey,
      ContentType: contentType,
      ...(privateChat ? { IfNoneMatch: '*' } : {}),
      ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
    })

    const uploadUrl = await getSignedUrl(storage.client, command, { expiresIn: privateChat ? Math.min(expiresIn, 300) : expiresIn })
    // Compatibility field name: this is a non-resolving reference, not a public URL.
    const publicUrl = privateChat ? `https://private-media.anstoss.invalid/${objectKey}` : this.publicBaseUrl
      ? `${this.publicBaseUrl}/${objectKey}`
      : null

    return { uploadUrl, publicUrl }
  }

  /**
   * Mint a short-lived signed GET URL for an object. Used for chat
   * media so the URL stored on Message.attachmentUrl (which may be
   * publicly fetchable depending on bucket policy) isn't the canonical
   * read path — every render rotates a fresh URL with a 1h TTL.
   * Throws if R2 isn't configured.
   */
  async presignGet(
    objectKey: string,
    expiresIn = 3600,
  ): Promise<string> {
    if (!this.client) {
      throw new Error('R2 not configured')
    }
    const storage = this.objectStorage(objectKey)
    const command = new GetObjectCommand({
      Bucket: storage.bucket,
      Key: objectKey,
    })
    return getSignedUrl(storage.client, command, { expiresIn: this.isPrivateChatKey(objectKey) ? Math.min(expiresIn, 300) : expiresIn })
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    if (objectKeys.length === 0) return
    if (!this.client) throw new Error('R2 not configured')

    await Promise.all(
      Array.from(new Set(objectKeys)).map((objectKey) => {
        if (this.isPrivateChatKey(objectKey)) return this.withStorageDeadline((signal) => this.retirePrivateChatObject(objectKey, signal))
        const storage = this.objectStorage(objectKey)
        return this.withStorageDeadline((abortSignal) => storage.client.send(
          new DeleteObjectCommand({
            Bucket: storage.bucket,
            Key: objectKey,
          }),
          { abortSignal },
        ))
      }),
    )
  }

  /**
   * Safeguarding: move a removed chat attachment out of its public path.
   * Uses a deterministic private key so a retry after a delete/database failure
   * recovers the same evidence. This retains the first copied version. Never
   * falls back to the public bucket. Null means the source and private copy are
   * both already absent; missing configuration is an error, not a success.
   */
  async quarantineObject(objectKey: string): Promise<{ bucket: string; key: string } | null> {
    return this.withStorageDeadline((signal) => this.moveToQuarantine(objectKey, signal))
  }

  /** Abort the actual SDK requests, not just the promise awaiting them. */
  private async withStorageDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    timer.unref?.()
    try {
      return await operation(controller.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  private async moveToQuarantine(objectKey: string, abortSignal: AbortSignal): Promise<{ bucket: string; key: string } | null> {
    if (!this.client || !this.quarantineClient || !this.quarantineBucket || this.quarantineBucket === this.bucket) {
      throw new Error('Private R2 quarantine storage is not configured')
    }
    const bucket = this.quarantineBucket
    const sourceStorage = this.objectStorage(objectKey)
    const name = objectKey.split('/').pop() || 'object'
    const digest = createHash('sha256').update(`${sourceStorage.bucket}/${objectKey}`).digest('hex')
    const key = `quarantine/${digest}/${name}`
    const privateCopyExists = async () => {
      try {
        await this.quarantineClient!.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal })
        return true
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false
        throw error
      }
    }
    if (!(await privateCopyExists())) {
      const source = await sourceStorage.client.send(new GetObjectCommand({ Bucket: sourceStorage.bucket, Key: objectKey }), { abortSignal })
        .catch(async (error) => {
          if (error.$metadata?.httpStatusCode !== 404) throw error
          // Another worker may have finished moving the object while
          // this worker was checking. Recheck before declaring evidence absent.
          if (await privateCopyExists()) return null
          return undefined
        })
      if (source === undefined) return null
      if (source !== null) {
        try {
          if (source.ContentLength === 0 || source.ContentType === 'application/x-anstoss-removed') {
            // A competing worker may already have preserved the original.
            // Never overwrite it with the source's removal marker.
            if (!(await privateCopyExists())) throw new Error('Removed source has no preserved evidence')
          } else {
            if (!source.Body || source.ContentLength === undefined) {
              throw new Error('R2 source object could not be read for quarantine')
            }
            // R2 CopyObject cannot cross jurisdiction endpoints.
            await this.quarantineClient.send(new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: source.Body,
              ContentLength: source.ContentLength,
              ContentType: source.ContentType,
              IfNoneMatch: '*',
            }), { abortSignal }).catch(async (error) => {
              if (error.$metadata?.httpStatusCode !== 412 || !(await privateCopyExists())) throw error
            })
          }
        } finally {
          (source.Body as { destroy?: () => void } | undefined)?.destroy?.()
        }
      }
    }
    if (this.isPrivateChatKey(objectKey)) await this.retirePrivateChatObject(objectKey, abortSignal)
    else await sourceStorage.client.send(new DeleteObjectCommand({ Bucket: sourceStorage.bucket, Key: objectKey }), { abortSignal })
    return { bucket, key }
  }

  /** Keep an empty object until every issued PUT has expired, preventing replay. */
  private async retirePrivateChatObject(objectKey: string, abortSignal: AbortSignal): Promise<void> {
    const storage = this.objectStorage(objectKey)
    const marker = `retired-chat/${createHash('sha256').update(objectKey).digest('hex')}`
    // Durable cleanup pointer is written first; failed replacement remains retryable.
    await storage.client.send(new PutObjectCommand({
      Bucket: storage.bucket, Key: marker, Body: '', ContentLength: 0,
      Metadata: { source: Buffer.from(objectKey).toString('base64'), expires: String(Date.now() + 10 * 60_000) },
    }), { abortSignal })
    await storage.client.send(new PutObjectCommand({
      Bucket: storage.bucket, Key: objectKey, Body: '', ContentLength: 0,
      ContentType: 'application/x-anstoss-removed',
    }), { abortSignal })
  }

  /** Cleanup is restart-safe and never deletes a tombstone during PUT validity. */
  async purgeRetiredChatObjects(now = Date.now()): Promise<void> {
    if (!this.quarantineClient || !this.quarantineBucket) return
    const client = this.quarantineClient
    const Bucket = this.quarantineBucket
    let ContinuationToken: string | undefined
    do {
      const page = await this.withStorageDeadline((abortSignal) => client.send(new ListObjectsV2Command({
        Bucket, Prefix: 'retired-chat/', MaxKeys: 200, ContinuationToken,
      }), { abortSignal }))
      for (const row of page.Contents ?? []) {
        if (!row.Key) continue
        const Key = row.Key
        await this.withStorageDeadline(async (abortSignal) => {
          const info = await client.send(new HeadObjectCommand({ Bucket, Key }), { abortSignal })
          const expires = Number(info.Metadata?.expires)
          const source = Buffer.from(info.Metadata?.source ?? '', 'base64').toString()
          if (!Number.isFinite(expires) || expires <= 0 || expires > now || !this.isPrivateChatKey(source)) return
          if (Key !== `retired-chat/${createHash('sha256').update(source).digest('hex')}`) return
          await client.send(new DeleteObjectCommand({ Bucket, Key: source }), { abortSignal })
          await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal })
        })
      }
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (ContinuationToken)
  }

  private clientForBucket(bucket: string): S3Client {
    if (bucket === this.bucket && this.client) return this.client
    if (bucket === this.quarantineBucket && this.quarantineClient) return this.quarantineClient
    throw new Error('R2 bucket is not configured for evidence access')
  }

  /** Short-lived signed GET for an object in a given bucket (quarantine). */
  async presignGetIn(bucket: string, objectKey: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(this.clientForBucket(bucket), new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
      expiresIn,
    })
  }

  async deleteObjectIn(bucket: string, objectKey: string): Promise<void> {
    await this.withStorageDeadline((abortSignal) =>
      this.clientForBucket(bucket).send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }), { abortSignal }),
    )
  }

  /**
   * Recover the bucket-relative objectKey from a stored attachment URL.
   * Returns null when the URL doesn't match the configured public base
   * (so we don't try to re-sign URLs that point elsewhere — e.g. an
   * external avatar URL).
   */
  objectKeyFromUrl(url: string): string | null {
    try {
      const candidate = new URL(url)
      // Reject URL-parser normalization aliases (surrounding whitespace,
      // embedded tabs/newlines, backslashes) that would evade suffix-based
      // reference checks. Canonical encoded or ordinary Unicode URLs are valid.
      if (url !== candidate.href && url !== decodeURI(candidate.href)) return null
      if (candidate.origin === 'https://private-media.anstoss.invalid') {
        const key = decodeURIComponent(candidate.pathname.slice(1))
        return this.isPrivateChatKey(key) && !key.includes('..') && !candidate.search && !candidate.hash
          && candidate.pathname === new URL(`https://canonical.invalid/${key}`).pathname
          && !candidate.username && !candidate.password ? key : null
      }
      if (!this.publicBaseUrl) return null
      const base = new URL(this.publicBaseUrl)
      if (candidate.origin !== base.origin) return null
      const basePath = base.pathname.replace(/\/$/, '')
      if (!candidate.pathname.startsWith(`${basePath}/`)) return null
      const key = decodeURIComponent(candidate.pathname.slice(basePath.length + 1))
      if (!key || key.includes('..') || candidate.search || candidate.hash || this.isPrivateChatKey(key)) return null
      if (candidate.username || candidate.password || candidate.pathname !== new URL(`${base.origin}${basePath}/${key}`).pathname) return null
      return key
    } catch {
      return null
    }
  }

  async assertStoredObject(
    objectKey: string,
    options: { maxBytes: number; allowedContentTypes: ReadonlySet<string> },
  ): Promise<void> {
    if (!this.client) throw new Error('R2 not configured')
    const storage = this.objectStorage(objectKey)
    const result = await storage.client.send(
      new HeadObjectCommand({ Bucket: storage.bucket, Key: objectKey }),
    )
    if (!result.ContentLength || result.ContentLength > options.maxBytes) {
      throw new Error('Uploaded file exceeds the allowed size')
    }
    if (!result.ContentType || !options.allowedContentTypes.has(result.ContentType)) {
      throw new Error('Uploaded file type does not match the upload intent')
    }
  }
}
