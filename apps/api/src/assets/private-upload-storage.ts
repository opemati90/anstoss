import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  ListMultipartUploadsCommand,
  HeadObjectCommand,
  S3Client,
  S3ClientConfig,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Storage boundary for the next private-media protocol, not yet wired to routes.
 * Callers must persist intent before initiation, and persist a finalization lease
 * before complete. A timeout is UNKNOWN, never proof that a write did not happen.
 * Client capabilities only upload a single part; completion stays server-side.
 */
export class PrivateUploadStorage {
  private readonly client: S3Client

  constructor(
    config: Pick<S3ClientConfig, 'region' | 'endpoint' | 'credentials' | 'requestHandler'>,
    private readonly bucket: string,
  ) {
    if (!bucket) throw new Error('Private upload bucket is required')
    // Do not inherit arbitrary retry middleware/configuration. A retry after an
    // ambiguous initiation can create an untracked second upload session.
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.credentials,
      requestHandler: config.requestHandler,
      maxAttempts: 1,
    })
  }

  private key(key: string) {
    // No club/user IDs or original filenames in provider object metadata.
    if (
      !/^private-chat\/v2\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        key,
      )
    ) {
      throw new Error('Invalid private upload key')
    }
    return { Bucket: this.bucket, Key: key }
  }

  private upload(key: string, uploadId: string) {
    if (!uploadId || uploadId.length > 2048 || /[\r\n]/.test(uploadId)) {
      throw new Error('Invalid multipart upload ID')
    }
    return { ...this.key(key), UploadId: uploadId }
  }

  private size(bytes: number) {
    // One final part may be smaller than 5 MiB. Chat's per-kind limits are
    // additionally enforced by the caller; never allow an unbounded part.
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 100 * 1024 * 1024) {
      throw new Error('Invalid private upload size')
    }
  }

  async initiate(key: string, contentType: string): Promise<string> {
    const location = this.key(key)
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(contentType)) {
      throw new Error('Invalid private upload content type')
    }
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        ...location,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    )
    if (!result.UploadId) throw new Error('Multipart initiation outcome is unknown')
    return result.UploadId
  }

  async signPart(key: string, uploadId: string, bytes: number): Promise<string> {
    this.size(bytes)
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        ...this.upload(key, uploadId),
        PartNumber: 1,
        ContentLength: bytes,
      }),
      { expiresIn: 300 },
    )
  }

  async complete(key: string, uploadId: string, expectedBytes: number): Promise<void> {
    this.size(expectedBytes)
    const location = this.upload(key, uploadId)
    // Never trust a client-supplied ETag or completion manifest. Unexpected
    // extra/truncated parts must not become a final object.
    const listed = await this.client.send(
      new ListPartsCommand({
        ...location,
        MaxParts: 2,
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    )
    const part = listed.Parts?.[0]
    if (
      listed.IsTruncated ||
      listed.Parts?.length !== 1 ||
      part?.PartNumber !== 1 ||
      part.Size !== expectedBytes ||
      !part.ETag
    ) {
      throw new Error('Private upload part is incomplete or invalid')
    }
    await this.client.send(
      new CompleteMultipartUploadCommand({
        ...location,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    )
  }

  /** Observation only: even an empty listing is not a terminal receipt. */
  async discover(key: string): Promise<{ uploadIds: string[]; truncated: boolean }> {
    const { Bucket, Key } = this.key(key)
    const found = new Set<string>()
    const cursors = new Set<string>()
    let KeyMarker: string | undefined
    let UploadIdMarker: string | undefined
    const abortSignal = AbortSignal.timeout(30_000)
    for (let page = 0; page < 20; page++) {
      const result = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket,
          Prefix: Key,
          KeyMarker,
          UploadIdMarker,
          MaxUploads: 100,
        }),
        { abortSignal },
      )
      for (const upload of result.Uploads ?? []) {
        if (upload.Key !== Key) continue
        this.upload(Key, upload.UploadId ?? '')
        found.add(upload.UploadId!)
      }
      if (!result.IsTruncated) return { uploadIds: [...found], truncated: false }
      const next = JSON.stringify([result.NextKeyMarker, result.NextUploadIdMarker])
      if (!result.NextKeyMarker || !result.NextUploadIdMarker || cursors.has(next)) {
        throw new Error('Private upload discovery cursor is incomplete or repeated')
      }
      cursors.add(next)
      KeyMarker = result.NextKeyMarker
      UploadIdMarker = result.NextUploadIdMarker
    }
    return { uploadIds: [...found], truncated: true }
  }

  async observeObject(
    key: string,
  ): Promise<
    { kind: 'present'; bytes: number; contentType: string; etag: string } | { kind: 'not_observed' }
  > {
    const location = this.key(key)
    try {
      const result = await this.client.send(new HeadObjectCommand(location), {
        abortSignal: AbortSignal.timeout(30_000),
      })
      if (
        !Number.isSafeInteger(result.ContentLength) ||
        result.ContentLength! < 1 ||
        !result.ContentType ||
        !result.ETag
      )
        throw new Error('Private upload object metadata is invalid')
      return {
        kind: 'present',
        bytes: result.ContentLength!,
        contentType: result.ContentType,
        etag: result.ETag,
      }
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (
        ['NotFound', 'NoSuchKey'].includes(failure?.name ?? '') &&
        failure?.$metadata?.httpStatusCode === 404
      ) {
        return { kind: 'not_observed' }
      }
      throw error
    }
  }

  async abort(key: string, uploadId: string): Promise<void> {
    // Propagate all errors, including NoSuchUpload. The durable lifecycle must
    // reconcile ambiguous completion/abort outcomes; this method cannot infer
    // erasure from a missing upload or a negative object read.
    await this.client.send(new AbortMultipartUploadCommand(this.upload(key, uploadId)), {
      abortSignal: AbortSignal.timeout(30_000),
    })
  }
}
