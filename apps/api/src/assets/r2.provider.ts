import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class R2Provider {
  private readonly logger = new Logger(R2Provider.name)
  private readonly client: S3Client | null
  private readonly bucket: string
  private readonly publicBaseUrl: string | null

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    this.bucket = process.env.R2_BUCKET_NAME || 'anstoss-assets'
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
  }

  get enabled(): boolean {
    return !!this.client
  }

  async presignPut(
    objectKey: string,
    contentType: string,
    expiresIn = 600,
  ): Promise<{ uploadUrl: string; publicUrl: string | null }> {
    if (!this.client) {
      throw new Error('R2 not configured')
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
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

  /**
   * Recover the bucket-relative objectKey from a stored attachment URL.
   * Returns null when the URL doesn't match the configured public base
   * (so we don't try to re-sign URLs that point elsewhere — e.g. an
   * external avatar URL).
   */
  objectKeyFromUrl(url: string): string | null {
    if (!this.publicBaseUrl) return null
    if (!url.startsWith(this.publicBaseUrl)) return null
    const tail = url.slice(this.publicBaseUrl.length)
    return tail.startsWith('/') ? tail.slice(1) : tail
  }
}
