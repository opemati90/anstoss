import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

  async presignPut(
    objectKey: string,
    contentType: string,
    contentLength?: number,
    expiresIn = 600,
  ): Promise<{ uploadUrl: string; publicUrl: string | null }> {
    if (!this.client) {
      throw new Error('R2 not configured')
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
      ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
    })

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn })
    const publicUrl = this.publicBaseUrl
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
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    })
    return getSignedUrl(this.client, command, { expiresIn })
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    if (!this.client || objectKeys.length === 0) return

    await Promise.all(
      Array.from(new Set(objectKeys)).map((objectKey) =>
        this.client!.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: objectKey,
          }),
        ),
      ),
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
    if (!this.client || !this.quarantineClient || !this.quarantineBucket || this.quarantineBucket === this.bucket) {
      throw new Error('Private R2 quarantine storage is not configured')
    }
    const bucket = this.quarantineBucket
    const name = objectKey.split('/').pop() || 'object'
    const digest = createHash('sha256').update(`${this.bucket}/${objectKey}`).digest('hex')
    const key = `quarantine/${digest}/${name}`
    const privateCopyExists = async () => {
      try {
        await this.quarantineClient!.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false
        throw error
      }
    }
    if (!(await privateCopyExists())) {
      const source = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }))
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
          }))
        } finally {
          (source.Body as { destroy?: () => void } | undefined)?.destroy?.()
        }
      }
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }))
    return { bucket, key }
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
    await this.clientForBucket(bucket).send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
  }

  /**
   * Recover the bucket-relative objectKey from a stored attachment URL.
   * Returns null when the URL doesn't match the configured public base
   * (so we don't try to re-sign URLs that point elsewhere — e.g. an
   * external avatar URL).
   */
  objectKeyFromUrl(url: string): string | null {
    if (!this.publicBaseUrl) return null
    try {
      const candidate = new URL(url)
      const base = new URL(this.publicBaseUrl)
      if (candidate.origin !== base.origin) return null
      const basePath = base.pathname.replace(/\/$/, '')
      if (!candidate.pathname.startsWith(`${basePath}/`)) return null
      const key = decodeURIComponent(candidate.pathname.slice(basePath.length + 1))
      if (!key || key.includes('..') || candidate.search || candidate.hash) return null
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
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    )
    if (!result.ContentLength || result.ContentLength > options.maxBytes) {
      throw new Error('Uploaded file exceeds the allowed size')
    }
    if (!result.ContentType || !options.allowedContentTypes.has(result.ContentType)) {
      throw new Error('Uploaded file type does not match the upload intent')
    }
  }
}
