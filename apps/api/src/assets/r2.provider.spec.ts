import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { R2Provider } from './r2.provider'

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
    jest.restoreAllMocks()
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

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
})
