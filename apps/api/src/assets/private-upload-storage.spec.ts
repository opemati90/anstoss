import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  S3Client,
  ListMultipartUploadsCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { PrivateUploadStorage } from './private-upload-storage'
import { Readable } from 'stream'

const key = 'private-chat/v2/6ecfefdc-8656-42f4-a6b8-7d3f691c9bd0'

describe('server-controlled private multipart storage', () => {
  const config = {
    region: 'auto',
    endpoint: 'https://example.eu.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
  }
  const storage = new PrivateUploadStorage(config, 'private-test')
  afterEach(() => jest.restoreAllMocks())

  it('initiates an opaque object with no identifying metadata', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ UploadId: 'upload-1' } as never)
    await expect(storage.initiate(key, 'image/png')).resolves.toBe('upload-1')
    expect(send.mock.calls[0][0]).toBeInstanceOf(CreateMultipartUploadCommand)
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'private-test',
      Key: key,
      ContentType: 'image/png',
    })
  })

  it('signs only a bounded part capability, not final-object PUT or completion', async () => {
    const url = new URL(await storage.signPart(key, 'upload-1', 42))
    expect(url.searchParams.get('uploadId')).toBe('upload-1')
    expect(url.searchParams.get('partNumber')).toBe('1')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length')
  })

  it('honors a shorter capability lifetime', async () => {
    const url = new URL(await storage.signPart(key, 'upload-1', 42, 60, new Date('2026-10-27T12:00:00Z')))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261027T120000Z')
    expect(url.searchParams.get('partNumber')).toBe('1')
  })

  it('signs private GETs only in its dedicated bucket with a five-minute lifetime', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send')
    const url = new URL(await storage.signGet(key, 300, new Date('2026-10-27T12:00:00Z')))
    expect(url.hostname).toBe('private-test.example.eu.r2.cloudflarestorage.com')
    expect(url.pathname).toBe(`/${key}`)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261027T120000Z')
    expect(url.searchParams.has('uploadId')).toBe(false)
    expect(url.searchParams.has('partNumber')).toBe(false)
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store')
    expect(send).not.toHaveBeenCalled()
  })

  it('supports a shorter private GET lifetime', async () => {
    const url = new URL(await storage.signGet(key, 60))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60')
  })

  it.each([0, -1, 301, 1.5, NaN, Infinity])('rejects invalid read lifetime %s', async (ttl) => {
    await expect(storage.signGet(key, ttl)).rejects.toThrow('lifetime')
  })

  it('rejects invalid read keys and signing dates', async () => {
    await expect(storage.signGet('chat/club/team/image/private-v1-file')).rejects.toThrow('key')
    await expect(storage.signGet(`${key}?query=injected`)).rejects.toThrow('key')
    await expect(storage.signGet(`${key}\n`)).rejects.toThrow('key')
    await expect(storage.signGet(`${key}\u2028`)).rejects.toThrow('key')
    await expect(storage.signGet(key, 300, new Date(NaN))).rejects.toThrow('signing time')
  })

  it.each([0, -1, 301, 1.5, NaN, Infinity])('rejects invalid capability lifetime %s', async (ttl) => {
    await expect(storage.signPart(key, 'upload-1', 42, ttl)).rejects.toThrow('lifetime')
  })

  it('uses the storage-verified part and ETag to complete', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Parts: [{ PartNumber: 1, Size: 42, ETag: 'storage-etag' }],
      } as never)
      .mockResolvedValueOnce({} as never)
    await storage.complete(key, 'upload-1', 42)
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListPartsCommand)
    expect(send.mock.calls[1][0]).toBeInstanceOf(CompleteMultipartUploadCommand)
    expect(send.mock.calls[1][0].input).toMatchObject({
      MultipartUpload: { Parts: [{ PartNumber: 1, ETag: 'storage-etag' }] },
    })
  })

  it.each([
    {},
    { Parts: [] },
    { Parts: [{ PartNumber: 1, Size: 41, ETag: 'x' }] },
    { Parts: [{ PartNumber: 2, Size: 42, ETag: 'x' }] },
    { Parts: [{ PartNumber: 1, Size: 42 }] },
    { IsTruncated: true, Parts: [{ PartNumber: 1, Size: 42, ETag: 'x' }] },
    {
      Parts: [
        { PartNumber: 1, Size: 42, ETag: 'x' },
        { PartNumber: 2, Size: 1, ETag: 'y' },
      ],
    },
  ])('rejects invalid storage manifests without completing: %j', async (manifest) => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue(manifest as never)
    await expect(storage.complete(key, 'upload-1', 42)).rejects.toThrow('incomplete or invalid')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each([0, -1, 1.5, NaN, Infinity, 100 * 1024 * 1024 + 1])(
    'rejects invalid size %s before I/O',
    async (size) => {
      const send = jest.spyOn(S3Client.prototype, 'send')
      await expect(storage.signPart(key, 'upload-1', size)).rejects.toThrow('size')
      await expect(storage.complete(key, 'upload-1', size)).rejects.toThrow('size')
      expect(send).not.toHaveBeenCalled()
    },
  )

  it('rejects identifying keys and malformed IDs before I/O', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send')
    await expect(
      storage.initiate('chat/club/team/image/private-v1-name.png', 'image/png'),
    ).rejects.toThrow('key')
    await expect(storage.signPart(key, '', 42)).rejects.toThrow('ID')
    await expect(storage.initiate(key, 'image/png\r\nsecret')).rejects.toThrow('content type')
    expect(send).not.toHaveBeenCalled()
  })

  it('does not convert ambiguous completion into success or delete/abort automatically', async () => {
    const failure = new Error('connection lost')
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({ Parts: [{ PartNumber: 1, Size: 42, ETag: 'x' }] } as never)
      .mockImplementationOnce((async () => {
        throw failure
      }) as S3Client['send'])
    await expect(storage.complete(key, 'upload-1', 42)).rejects.toBe(failure)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('propagates missing/ambiguous aborts for durable reconciliation', async () => {
    const failure = Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' })
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => {
      throw failure
    }) as S3Client['send'])
    await expect(storage.abort(key, 'upload-1')).rejects.toBe(failure)
    expect(send.mock.calls[0][0]).toBeInstanceOf(AbortMultipartUploadCommand)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('dispatches initiation only once on a transient HTTP failure through real SDK middleware', async () => {
    const handle = jest.fn(async () => ({
      response: {
        statusCode: 503,
        headers: {},
        body: Readable.from(['<Error><Code>ServiceUnavailable</Code></Error>']),
      },
    }))
    const singleAttempt = new PrivateUploadStorage(
      { ...config, requestHandler: { handle } },
      'private-test',
    )
    await expect(singleAttempt.initiate(key, 'image/png')).rejects.toBeDefined()
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('discovers exact-key sessions across both pagination markers', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Uploads: [
          { Key: key, UploadId: 'one' },
          { Key: `${key}-other`, UploadId: 'foreign' },
        ],
        IsTruncated: true,
        NextKeyMarker: key,
        NextUploadIdMarker: 'one',
      } as never)
      .mockResolvedValueOnce({
        Uploads: [
          { Key: key, UploadId: 'two' },
          { Key: key, UploadId: 'one' },
        ],
      } as never)
    await expect(storage.discover(key)).resolves.toEqual({
      uploadIds: ['one', 'two'],
      truncated: false,
    })
    expect(send.mock.calls[1][0]).toBeInstanceOf(ListMultipartUploadsCommand)
    expect(send.mock.calls[1][0].input).toMatchObject({
      Prefix: key,
      KeyMarker: key,
      UploadIdMarker: 'one',
    })
  })

  it('rejects discovery pagination loops', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      IsTruncated: true,
      NextKeyMarker: key,
      NextUploadIdMarker: 'one',
    } as never)
    await expect(storage.discover(key)).rejects.toThrow('repeated')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('bounds discovery and marks incomplete scans', async () => {
    let page = 0
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => ({
      IsTruncated: true,
      NextKeyMarker: key,
      NextUploadIdMarker: String(++page),
    })) as S3Client['send'])
    await expect(storage.discover(key)).resolves.toEqual({ uploadIds: [], truncated: true })
    expect(send).toHaveBeenCalledTimes(20)
  })

  it('observes committed metadata without mutation', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ ContentLength: 42, ContentType: 'image/png', ETag: 'etag' } as never)
    await expect(storage.observeObject(key)).resolves.toEqual({
      kind: 'present',
      bytes: 42,
      contentType: 'image/png',
      etag: 'etag',
    })
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('labels negative reads as not observed, never deleted or completed', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => {
      throw Object.assign(new Error('missing'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
    }) as S3Client['send'])
    await expect(storage.observeObject(key)).resolves.toEqual({ kind: 'not_observed' })
  })

  it.each([
    { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    { name: 'TimeoutError' },
    { name: 'NotFound', $metadata: { httpStatusCode: 500 } },
  ])('propagates non-absence failures: %j', async (failure) => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => {
      throw failure
    }) as S3Client['send'])
    await expect(storage.observeObject(key)).rejects.toBe(failure)
  })

  it('removes only a validated opaque object key', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
    await storage.remove(key)
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand)
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'private-test', Key: key })
    await expect(storage.remove('chat/somebody/legacy')).rejects.toThrow('key')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('observes an empty multipart session as present, not aborted', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Parts: [] } as never)
    await expect(storage.observeMultipart(key, 'provider')).resolves.toEqual({ kind: 'present', hasParts: false })
  })

  it('recognizes only explicit NoSuchUpload404 as a missing session', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => {
      throw { name: 'NoSuchUpload', $metadata: { httpStatusCode: 404 } }
    }) as S3Client['send'])
    await expect(storage.observeMultipart(key, 'provider')).resolves.toEqual({ kind: 'not_observed' })
  })

  it.each([
    { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    { name: 'NoSuchUpload', $metadata: { httpStatusCode: 500 } },
    { name: 'NotFound', $metadata: { httpStatusCode: 404 } },
  ])('does not mistake multipart failure for an abort receipt: %j', async (failure) => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => { throw failure }) as S3Client['send'])
    await expect(storage.observeMultipart(key, 'provider')).rejects.toBe(failure)
  })

  it('does not retry initiation when the transport loses the response', async () => {
    const handle = jest.fn(async () => {
      throw Object.assign(new Error('response lost'), { name: 'TimeoutError' })
    })
    const singleAttempt = new PrivateUploadStorage(
      { ...config, requestHandler: { handle } },
      'private-test',
    )
    await expect(singleAttempt.initiate(key, 'image/png')).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    expect(handle).toHaveBeenCalledTimes(1)
  })
})
