import { Alert } from 'react-native'
import {
  api,
  setTokenGetter,
  setSignOutHandler,
  setAuthExpiryHandlingSuspended,
} from '../api/client'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as any
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})

describe('api client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setTokenGetter(async () => 'test-token')
    setSignOutHandler(null)
    setAuthExpiryHandlingSuspended(false)
  })

  afterAll(() => {
    alertSpy.mockRestore()
  })

  it('makes GET requests with auth header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: '1', name: 'Test' }),
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
      text: async () => JSON.stringify({ id: '2' }),
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
      text: async () => JSON.stringify({ message: 'Not authenticated' }),
    })

    await expect(api('/me')).rejects.toThrow('Not authenticated')
  })

  it('returns undefined for 204 responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    })

    const result = await api('/events/1', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('sends requests without auth when no token getter set', async () => {
    setTokenGetter(async () => null)

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    })

    await api('/health')

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers.Authorization).toBeUndefined()
  })

  it('returns undefined for successful empty response bodies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })

    const result = await api('/clubs/setup', {
      method: 'POST',
      body: {},
    })

    expect(result).toBeUndefined()
  })

  it('returns text for successful non-json response bodies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok',
    })

    const result = await api<string>('/health')

    expect(result).toBe('ok')
  })

  it('alerts and signs out on 401 when auth-expiry handling is active', async () => {
    const signOutHandler = jest.fn(async () => {})
    setSignOutHandler(signOutHandler)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ message: 'Not authenticated' }),
    })

    await expect(api('/me')).rejects.toThrow('Not authenticated')

    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(signOutHandler).toHaveBeenCalledTimes(1)
  })

  it('suppresses the session-expired alert during an intentional sign-out', async () => {
    const signOutHandler = jest.fn(async () => {})
    setSignOutHandler(signOutHandler)
    setAuthExpiryHandlingSuspended(true)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ message: 'Not authenticated' }),
    })

    await expect(api('/me')).rejects.toThrow('Not authenticated')

    expect(alertSpy).not.toHaveBeenCalled()
    expect(signOutHandler).not.toHaveBeenCalled()
  })
})
