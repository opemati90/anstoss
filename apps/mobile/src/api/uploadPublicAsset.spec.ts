import { AssetUploadError, uploadPublicAsset } from './uploadPublicAsset'

describe('public asset upload acknowledgement', () => {
  const originalFetch = global.fetch
  const reservation = {
    enabled: true,
    uploadUrl: 'https://storage.example/put?signature=secret',
    publicUrl: 'https://assets.example/logo.png',
  }
  const blob = { size: 12 } as Blob
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
  })
  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it('returns the permanent URL only after a successful upload', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
    await expect(uploadPublicAsset(reservation, blob, 'image/png')).resolves.toBe(
      reservation.publicUrl,
    )
    expect(global.fetch).toHaveBeenCalledWith(reservation.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
      signal: expect.anything(),
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([403, 413, 500, 503])(
    'rejects HTTP %s without returning a persistable URL',
    async (status) => {
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status })
      await expect(uploadPublicAsset(reservation, blob, 'image/png')).rejects.toBeInstanceOf(
        AssetUploadError,
      )
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    },
  )

  it.each([
    { enabled: false },
    { uploadUrl: null },
    { publicUrl: null },
    { publicUrl: 'file:///logo.png' },
    { uploadUrl: 'http://storage.example/put' },
    { publicUrl: 'https://user:password@assets.example/logo.png' },
  ])('rejects unavailable or invalid reservations before upload: %j', async (change) => {
    await expect(
      uploadPublicAsset({ ...reservation, ...change }, blob, 'image/png'),
    ).rejects.toBeInstanceOf(AssetUploadError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects empty images', async () => {
    await expect(
      uploadPublicAsset(reservation, { size: 0 } as Blob, 'image/png'),
    ).rejects.toBeInstanceOf(AssetUploadError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not leak provider URLs or retry a failed request', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error(reservation.uploadUrl))
    await expect(uploadPublicAsset(reservation, blob, 'image/png')).rejects.toThrow(
      'Asset upload failed',
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('aborts a stalled upload without acknowledging success', async () => {
    ;(global.fetch as jest.Mock).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const result = expect(uploadPublicAsset(reservation, blob, 'image/png')).rejects.toBeInstanceOf(
      AssetUploadError,
    )
    await jest.advanceTimersByTimeAsync(60_000)
    await result
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('rejects on deadline even if native fetch ignores abort and later succeeds', async () => {
    let resolve!: (value: { ok: boolean }) => void
    ;(global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const upload = uploadPublicAsset(reservation, blob, 'image/png')
    const failure = expect(upload).rejects.toBeInstanceOf(AssetUploadError)
    await jest.advanceTimersByTimeAsync(60_000)
    await failure
    resolve({ ok: true })
    await expect(upload).rejects.toBeInstanceOf(AssetUploadError)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})
