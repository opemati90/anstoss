import { R2Provider } from './r2.provider'
import { runPrivateMediaCanary } from '../../scripts/verify-private-media'
import { createHash } from 'crypto'

jest.mock('./r2.provider', () => ({ R2Provider: jest.fn() }))

describe('private-media canary safety', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch
  const originalExitCode = process.exitCode
  let output: jest.SpyInstance
  let provider: { presignPut: jest.Mock; deleteObjectIn: jest.Mock; presignGetIn: jest.Mock }

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RUN_PRIVATE_MEDIA_CANARY: '1',
      R2_QUARANTINE_BUCKET: 'anstoss-quarantine',
      R2_QUARANTINE_JURISDICTION: 'eu',
    }
    process.exitCode = undefined
    output = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
    provider = {
      presignPut: jest.fn().mockRejectedValue(new Error('secret-url-must-not-be-logged')),
      deleteObjectIn: jest.fn().mockResolvedValue(undefined),
      presignGetIn: jest.fn().mockResolvedValue('https://synthetic.invalid/object'),
    }
    ;(R2Provider as jest.Mock).mockReturnValue(provider)
    global.fetch = jest.fn().mockResolvedValue({ status: 404, body: { cancel: jest.fn() } })
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('cannot construct a storage client without explicit enablement', async () => {
    delete process.env.RUN_PRIVATE_MEDIA_CANARY
    await expect(runPrivateMediaCanary()).rejects.toThrow('Canary not explicitly enabled')
    expect(R2Provider).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['R2_QUARANTINE_BUCKET', 'public-assets'],
    ['R2_QUARANTINE_JURISDICTION', ''],
  ])('rejects an unexpected %s before storage access', async (key, value) => {
    process.env[key] = value
    await expect(runPrivateMediaCanary()).rejects.toThrow('Unexpected private storage context')
    expect(R2Provider).not.toHaveBeenCalled()
  })

  it('cleans only its three synthetic keys after failure and does not disclose errors', async () => {
    await runPrivateMediaCanary()
    expect(provider.deleteObjectIn).toHaveBeenCalledTimes(3)
    const keys = provider.deleteObjectIn.mock.calls.map(([bucket, key]) => {
      expect(bucket).toBe('anstoss-quarantine')
      return key as string
    })
    expect(keys[0]).toMatch(/^chat\/release-canary\/[a-f0-9-]+\/file\/private-v1-[a-f0-9-]+\.pdf$/)
    expect(keys[1]).toMatch(/^retired-chat\/[a-f0-9]{64}$/)
    expect(keys[2]).toMatch(/^quarantine\/[a-f0-9]{64}\/private-v1-[a-f0-9-]+\.pdf$/)
    const text = output.mock.calls.map(([value]) => value).join('')
    expect(JSON.parse(text)).toMatchObject({ passed: false, cleanupComplete: true })
    expect(text).not.toContain('secret-url')
    expect(process.exitCode).toBe(1)
  })

  it('does not count a successful delete as proof of absence', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 500, body: { cancel: jest.fn() } })
    await runPrivateMediaCanary()
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
      passed: false,
      cleanupComplete: false,
    })
    expect(process.exitCode).toBe(1)
  })

  it.each([
    ['valid lifecycle', false, 412, true],
    ['corrupted evidence', true, 412, false],
    ['accepted replay', false, 200, false],
  ])(
    'verifies the full sequence: %s',
    async (_label, corruptEvidence, replayStatus, expectedPass) => {
      const payload = '%PDF-1.0\nAnstoss synthetic private-media canary\n%%EOF\n'
      provider.presignPut.mockImplementation(async (key: string) => ({
        publicUrl: `https://private-media.anstoss.invalid/${key}`,
        uploadUrl: 'https://synthetic.invalid/upload',
      }))
      Object.assign(provider, {
        assertStoredObject: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Uploaded file exceeds the allowed size')),
        presignGet: jest.fn().mockResolvedValue('https://synthetic.invalid/read?signature=fake'),
        quarantineObject: jest.fn().mockImplementation(async (key: string) => ({
          bucket: 'anstoss-quarantine',
          key: `quarantine/${createHash('sha256').update(`anstoss-quarantine/${key}`).digest('hex')}/${key.split('/').pop()}`,
        })),
      })
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, text: async () => payload })
        .mockResolvedValueOnce({ status: 403 })
        .mockResolvedValueOnce({ status: 412 })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => (corruptEvidence ? 'corrupted' : payload),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
        .mockResolvedValueOnce({ status: replayStatus })
        .mockResolvedValue({ status: 404, body: { cancel: jest.fn() } })
      await runPrivateMediaCanary()
      const result = JSON.parse(output.mock.calls[0][0])
      expect(result.passed).toBe(expectedPass)
      if (expectedPass) {
        expect(result.cleanupComplete).toBe(true)
        expect(result.checks).toHaveLength(11)
        expect(global.fetch).toHaveBeenCalledTimes(10)
        expect(process.exitCode).toBeUndefined()
      } else {
        expect(process.exitCode).toBe(1)
        expect(result.checks).not.toContain(
          corruptEvidence ? 'evidence_preserved' : 'post_removal_replay_rejected',
        )
      }
    },
  )
})
