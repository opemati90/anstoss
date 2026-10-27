import { uploadMedia } from './uploadMedia'

jest.mock('./client', () => ({ API_URL: 'https://api.example.test' }))

describe('private channel upload transport', () => {
  const originalFetch = global.fetch
  const input = {
    teamId: 'team', token: 'session-token', uri: 'file:///image.png',
    contentType: 'image/png', kind: 'image' as const,
  }
  afterEach(() => { global.fetch = originalFetch })

  it('advertises private-media support and forwards signed conditional PUT headers', async () => {
    const blob = { size: 12 }
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ blob: async () => blob })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        enabled: true, uploadUrl: 'https://private.example/put',
        publicUrl: 'https://private-media.anstoss.invalid/chat/reference', objectKey: 'chat/reference',
        uploadHeaders: { 'If-None-Match': '*' },
      }) })
      .mockResolvedValueOnce({ ok: true })
    global.fetch = fetchMock
    await expect(uploadMedia(input)).resolves.toMatchObject({ objectKey: 'chat/reference' })
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: 'Bearer session-token', 'X-Anstoss-Private-Media': '1',
    })
    expect(fetchMock.mock.calls[2]).toEqual(['https://private.example/put', {
      method: 'PUT', headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' }, body: blob,
    }])
  })

  it('does not PUT when presigning refuses the client', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ blob: async () => ({ size: 12 }) })
      .mockResolvedValueOnce({ ok: false, status: 426 })
    global.fetch = fetchMock
    await expect(uploadMedia(input)).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
