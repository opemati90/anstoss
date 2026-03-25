import { api, setTokenGetter } from '../api/client'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as any

describe('api client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setTokenGetter(async () => 'test-token')
  })

  it('makes GET requests with auth header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Test' }),
    })

    const result = await api('/me')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/me'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(result).toEqual({ id: '1', name: 'Test' })
  })

  it('makes POST requests with body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '2' }),
    })

    await api('/events', {
      method: 'POST',
      body: { title: 'Training' },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/events'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Training' }),
      }),
    )
  })

  it('throws on non-ok responses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Not authenticated' }),
    })

    await expect(api('/me')).rejects.toThrow('Not authenticated')
  })

  it('returns undefined for 204 responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    })

    const result = await api('/events/1', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('sends requests without auth when no token getter set', async () => {
    setTokenGetter(async () => null)

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await api('/health')

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers.Authorization).toBeUndefined()
  })
})
