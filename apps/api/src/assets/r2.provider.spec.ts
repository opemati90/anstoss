import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { R2Provider } from './r2.provider'
import { ModerationSafetyWorker } from '../moderation/moderation-safety'

describe('R2Provider public URL parsing', () => {
  const previous = process.env.R2_PUBLIC_BASE_URL

  afterEach(() => {
    if (previous === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = previous
  })

  it('requires the exact configured origin and rejects traversal/query aliases', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://assets.anstoss.app/public'
    const provider = new R2Provider()

    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/chat/a.png'))
      .toBe('chat/a.png')
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app.evil/public/chat/a.png'))
      .toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/../private/a.png'))
      .toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/chat/a.png?override=1'))
      .toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/%63hat/a.png')).toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/chat/a.png ')).toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/ch\tat/a.png')).toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/private-chat/v2/opaque')).toBeNull()
    expect(provider.objectKeyFromUrl('https://assets.anstoss.app/public/private-chat')).toBeNull()
    expect(provider.objectKeyFromUrl('https://private-media.anstoss.invalid/dm/club/conversation/%66ile/private-v1-a.pdf')).toBeNull()
    expect(provider.objectKeyFromUrl('https://private-media.anstoss.invalid/dm/club/conversation/file/%70rivate-v1-a.pdf')).toBeNull()
    expect(provider.objectKeyFromUrl('https://private-media.anstoss.invalid/dm/club/conversation/file/private-v1-a.pdf'))
      .toBe('dm/club/conversation/file/private-v1-a.pdf')
  })
})

describe('R2Provider deletion configuration', () => {
  it('fails nonempty cleanup when credentials are unavailable instead of acknowledging erasure', async () => {
    const original = process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_ACCESS_KEY_ID
    try {
      const provider = new R2Provider()
      await expect(provider.deleteObjects(['users/synthetic/avatar.png'])).rejects.toThrow('R2 not configured')
      await expect(provider.deleteObjects([])).resolves.toBeUndefined()
    } finally {
      if (original === undefined) delete process.env.R2_ACCESS_KEY_ID
      else process.env.R2_ACCESS_KEY_ID = original
    }
  })
})

describe('R2Provider private quarantine', () => {
  const keys = [
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
    'R2_QUARANTINE_BUCKET', 'R2_QUARANTINE_ACCESS_KEY_ID',
    'R2_QUARANTINE_SECRET_ACCESS_KEY', 'R2_QUARANTINE_JURISDICTION',
  ] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = 'example-account'
    process.env.R2_ACCESS_KEY_ID = 'media-key'
    process.env.R2_SECRET_ACCESS_KEY = 'media-secret'
    process.env.R2_BUCKET_NAME = 'anstoss-assets'
    process.env.R2_QUARANTINE_BUCKET = 'anstoss-quarantine'
    process.env.R2_QUARANTINE_ACCESS_KEY_ID = 'quarantine-key'
    process.env.R2_QUARANTINE_SECRET_ACCESS_KEY = 'quarantine-secret'
    process.env.R2_QUARANTINE_JURISDICTION = 'eu'
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  it.each(['private-chat', 'private-chat/v2/7cbda286-645a-42df-a5c5-aec128baf355', 'private-chat/future/key'])(
    'refuses lifecycle-managed keys in every legacy storage operation: %s', async (key) => {
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
      const provider = new R2Provider()
      const reason = 'lifecycle storage adapter'
      await expect(provider.presignPut(key, 'image/png', 42)).rejects.toThrow(reason)
      await expect(provider.presignGet(key)).rejects.toThrow(reason)
      await expect(provider.assertStoredObject(key, { maxBytes: 42, allowedContentTypes: new Set(['image/png']) })).rejects.toThrow(reason)
      await expect(provider.quarantineObject(key)).rejects.toThrow(reason)
      await expect(provider.presignGetIn('anstoss-quarantine', key)).rejects.toThrow(reason)
      await expect(provider.deleteObjectIn('anstoss-quarantine', key)).rejects.toThrow(reason)
      // No partial public deletion when a mixed batch contains a v2 key.
      await expect(provider.deleteObjects(['users/example/avatar.png', key])).rejects.toThrow(reason)
      expect(send).not.toHaveBeenCalled()
    },
  )

  it('streams to the private EU endpoint before deleting the public original', async () => {
    const commands: string[] = []
    const endpoints: string[] = []
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(async function (command) {
      commands.push(command.constructor.name)
      const endpoint = await this.config.endpoint()
      endpoints.push(endpoint.hostname)
      if (command instanceof HeadObjectCommand) throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } })
      if (command instanceof GetObjectCommand) {
        return {
          Body: Readable.from(['sample']),
          ContentLength: 6,
          ContentType: 'image/png',
        }
      }
      return {}
    } as S3Client['send'])

    const result = await new R2Provider().quarantineObject('chat/sample.png')

    expect(result).toMatchObject({ bucket: 'anstoss-quarantine' })
    expect(commands).toEqual([
      HeadObjectCommand.name, GetObjectCommand.name, PutObjectCommand.name, DeleteObjectCommand.name,
    ])
    expect(endpoints).toEqual([
      'example-account.eu.r2.cloudflarestorage.com',
      'example-account.r2.cloudflarestorage.com',
      'example-account.eu.r2.cloudflarestorage.com',
      'example-account.r2.cloudflarestorage.com',
    ])
  })

  it('does not delete the public original when the private write fails', async () => {
    const commands: string[] = []
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: { constructor: { name: string } }) => {
      commands.push(command.constructor.name)
      if (command instanceof HeadObjectCommand) throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } })
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from(['sample']), ContentLength: 6 }
      }
      if (command instanceof PutObjectCommand) throw new Error('private write failed')
      return {}
    }) as S3Client['send'])

    await expect(new R2Provider().quarantineObject('chat/sample.png'))
      .rejects.toThrow('private write failed')
    expect(commands).toEqual([HeadObjectCommand.name, GetObjectCommand.name, PutObjectCommand.name])
  })

  it('recovers the same private object after source deletion fails', async () => {
    let privateExists = false
    let deleteAttempts = 0
    const privateKeys: string[] = []
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: { constructor: { name: string } }) => {
      if (command instanceof HeadObjectCommand) {
        if (!privateExists) throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } })
        return {}
      }
      if (command instanceof GetObjectCommand) return { Body: Readable.from(['sample']), ContentLength: 6 }
      if (command instanceof PutObjectCommand) {
        privateExists = true
        privateKeys.push(command.input.Key!)
      }
      if (command instanceof DeleteObjectCommand && ++deleteAttempts === 1) throw new Error('temporary delete failure')
      return {}
    }) as S3Client['send'])
    const provider = new R2Provider()
    await expect(provider.quarantineObject('chat/sample.png')).rejects.toThrow('temporary delete failure')
    const retried = await provider.quarantineObject('chat/sample.png')
    expect(retried?.key).toBe(privateKeys[0])
    expect(privateKeys).toHaveLength(1)
    expect(send.mock.calls.filter(([command]) => command instanceof GetObjectCommand)).toHaveLength(1)
  })

  it('never falls back to the public bucket when quarantine is unconfigured', async () => {
    delete process.env.R2_QUARANTINE_BUCKET
    const send = jest.spyOn(S3Client.prototype, 'send')
    await expect(new R2Provider().quarantineObject('chat/sample.png')).rejects.toThrow('Private R2 quarantine')
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses an unconfigured evidence bucket', async () => {
    const provider = new R2Provider()
    await expect(provider.presignGetIn('unrelated-bucket', 'anything')).rejects.toThrow(
      'R2 bucket is not configured for evidence access',
    )
  })

  it('stores new chat uploads privately and only resolves private references', async () => {
    const provider = new R2Provider()
    const key = 'chat/club/team/image/private-v1-123-image.png'
    const upload = await provider.presignPut(key, 'image/png', 6)
    const put = new URL(upload.uploadUrl)
    expect(put.hostname).toBe('anstoss-quarantine.example-account.eu.r2.cloudflarestorage.com')
    expect(put.pathname).toBe(`/${key}`)
    expect(put.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toContain('if-none-match')
    expect(upload.publicUrl).toBe(`https://private-media.anstoss.invalid/${key}`)
    expect(provider.objectKeyFromUrl(upload.publicUrl!)).toBe(key)
    expect(provider.objectKeyFromUrl(`${upload.publicUrl}?x=1`)).toBeNull()
    expect(provider.objectKeyFromUrl('https://private-media.anstoss.invalid/chat/legacy.png')).toBeNull()
    const get = new URL(await provider.presignGet(key))
    expect(get.hostname).toBe('anstoss-quarantine.example-account.eu.r2.cloudflarestorage.com')
    expect(get.pathname).toBe(`/${key}`)
    expect(get.searchParams.get('X-Amz-Expires')).toBe('300')
  })

  it('validates and retires private attachments without reopening the PUT key', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 6, ContentType: 'image/png' } as never)
    const provider = new R2Provider()
    const key = 'dm/club/conversation/image/private-v1-123-image.png'
    await provider.assertStoredObject(key, { maxBytes: 100, allowedContentTypes: new Set(['image/png']) })
    await provider.deleteObjects([key])
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'anstoss-quarantine', Key: key })
    expect(send.mock.calls[1][0].input).toMatchObject({ Bucket: 'anstoss-quarantine', Body: '', Metadata: { source: Buffer.from(key).toString('base64') } })
    expect(send.mock.calls[2][0].input).toMatchObject({ Bucket: 'anstoss-quarantine', Key: key, Body: '', ContentLength: 0 })
    expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(false)
  })

  it('keeps the upload barrier after restart and rejects a delayed commit beyond the former purge deadline', async () => {
    const objects = new Map<string, { Body?: unknown; Metadata?: Record<string, string> }>()
    const key = 'chat/club/team/image/private-v1-123.png'
    objects.set(key, { Body: 'private image' })
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command) => {
      if (command instanceof PutObjectCommand) {
        if (command.input.IfNoneMatch === '*' && objects.has(command.input.Key!)) {
          throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } })
        }
        objects.set(command.input.Key!, { Body: command.input.Body, Metadata: command.input.Metadata })
        return {}
      }
      if (command instanceof HeadObjectCommand) return objects.get(command.input.Key!) ?? {}
      if (command instanceof DeleteObjectCommand) { objects.delete(command.input.Key!); return {} }
      return {}
    }) as S3Client['send'])
    await new R2Provider().deleteObjects([key])
    expect(objects.get(key)?.Body).toBe('')
    const marker = [...objects.keys()].find((k) => k.startsWith('retired-chat/'))!
    expect(objects.get(marker)?.Metadata?.expires).toBeUndefined()
    // Exercise the real scheduler entry point after a provider/process restart.
    // Storage models R2's documented atomic condition-at-commit semantics.
    jest.useFakeTimers()
    const previousEnv = process.env.NODE_ENV
    const previousSwitch = process.env.MODERATION_SAFETY_SWEEP_ENABLED
    process.env.NODE_ENV = 'production'
    delete process.env.MODERATION_SAFETY_SWEEP_ENABLED
    const worker = new ModerationSafetyWorker({} as never, {} as never, new R2Provider())
    jest.spyOn(worker, 'retryPendingQuarantines').mockResolvedValue(0)
    jest.spyOn(worker, 'alertOverdue').mockResolvedValue([])
    jest.spyOn(worker, 'purgeExpiredEvidence').mockResolvedValue(0)
    try {
      worker.onModuleInit()
      await jest.advanceTimersByTimeAsync(24 * 60 * 60_000)
      expect(objects.get(key)?.Body).toBe('')
      expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(false)
      await expect(new S3Client({ region: 'auto' }).send(new PutObjectCommand({
        Bucket: 'anstoss-quarantine', Key: key, Body: 'delayed private image', IfNoneMatch: '*',
      }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 412 } })
      expect(objects.get(key)?.Body).toBe('')
    } finally {
      worker.onModuleDestroy()
      jest.useRealTimers()
      if (previousEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousEnv
      if (previousSwitch === undefined) delete process.env.MODERATION_SAFETY_SWEEP_ENABLED
      else process.env.MODERATION_SAFETY_SWEEP_ENABLED = previousSwitch
    }
  })

  it('fails closed instead of uploading private chat into public storage', async () => {
    delete process.env.R2_QUARANTINE_BUCKET
    const provider = new R2Provider()
    await expect(provider.presignPut('chat/club/team/image/private-v1-123.png', 'image/png', 6))
      .rejects.toThrow('Private chat storage is not configured')
  })

  it.each(['tombstone', 'copy-race'])('preserves existing evidence during a concurrent %s', async (race) => {
    let checks = 0
    const source = Readable.from(race === 'tombstone' ? [] : ['original'])
    const writes: PutObjectCommand[] = []
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command) => {
      if (command instanceof HeadObjectCommand) {
        if (++checks === 1) throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } })
        return { ContentLength: 8 }
      }
      if (command instanceof GetObjectCommand) return {
        Body: source, ContentLength: race === 'tombstone' ? 0 : 8,
        ContentType: race === 'tombstone' ? 'application/x-anstoss-removed' : 'image/png',
      }
      if (command instanceof PutObjectCommand) {
        writes.push(command)
        if (command.input.Key?.startsWith('quarantine/')) {
          expect(command.input.IfNoneMatch).toBe('*')
          throw Object.assign(new Error('already preserved'), { $metadata: { httpStatusCode: 412 } })
        }
      }
      return {}
    }) as S3Client['send'])
    await expect(new R2Provider().quarantineObject('chat/club/team/image/private-v1-test.png'))
      .resolves.toMatchObject({ bucket: 'anstoss-quarantine' })
    expect(writes.filter((command) => command.input.Key?.startsWith('quarantine/'))).toHaveLength(race === 'tombstone' ? 0 : 1)
    expect(source.destroyed).toBe(true)
  })

  it.each(['head', 'get', 'copy', 'delete'])('aborts stalled %s work and leaves it retryable', async (stage) => {
    jest.useFakeTimers()
    const body = Readable.from(['sample'])
    const signals: AbortSignal[] = []
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command, options) => {
      const signal = (options as { abortSignal: AbortSignal }).abortSignal
      signals.push(signal)
      const stall = (stage === 'head' && command instanceof HeadObjectCommand)
        || (stage === 'get' && command instanceof GetObjectCommand)
        || (stage === 'copy' && command instanceof PutObjectCommand)
        || (stage === 'delete' && command instanceof DeleteObjectCommand)
      if (stall) return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
      })
      if (command instanceof HeadObjectCommand) {
        throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } })
      }
      if (command instanceof GetObjectCommand) return { Body: body, ContentLength: 6 }
      return {}
    }) as S3Client['send'])
    const provider = new R2Provider()
    const assertion = expect(provider.quarantineObject('chat/sample.png')).rejects.toThrow('request aborted')
    await jest.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(signals.every((signal) => signal === signals[0] && signal.aborted)).toBe(true)
    if (stage === 'copy') {
      expect(body.destroyed).toBe(true)
      expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(false)
    }
    expect(jest.getTimerCount()).toBe(0)
    send.mockResolvedValue({} as never)
    await expect(provider.quarantineObject('chat/sample.png')).resolves.toMatchObject({ bucket: 'anstoss-quarantine' })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('bounds retention deletion and clears its timer on success', async () => {
    jest.useFakeTimers()
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (_command, options) =>
      new Promise((_, reject) => (options as { abortSignal: AbortSignal }).abortSignal.addEventListener('abort', () => reject(new Error('request aborted'))))
    ) as S3Client['send'])
    const provider = new R2Provider()
    const assertion = expect(provider.deleteObjectIn('anstoss-quarantine', 'quarantine/test')).rejects.toThrow('request aborted')
    await jest.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(jest.getTimerCount()).toBe(0)
    send.mockResolvedValue({} as never)
    await provider.deleteObjectIn('anstoss-quarantine', 'quarantine/test')
    expect(jest.getTimerCount()).toBe(0)
  })
})
