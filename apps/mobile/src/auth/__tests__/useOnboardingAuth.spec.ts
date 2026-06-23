import { renderHook, act } from '@testing-library/react-native'

const mockApi = jest.fn()
const mockSetSessionToken = jest.fn()

jest.mock('../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

jest.mock('../sessionToken', () => ({
  setSessionToken: (...args: unknown[]) => mockSetSessionToken(...args),
}))

import {
  classifyIdentifier,
  normalizeIdentifier,
  useOnboardingAuth,
} from '../useOnboardingAuth'

describe('useOnboardingAuth (custom email-OTP)', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockSetSessionToken.mockReset()
  })

  it('startOtp posts the normalized email to /auth/otp/request', async () => {
    mockApi.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.startOtp('Mara@Example.DE'))
    expect(mockApi).toHaveBeenCalledWith('/auth/otp/request', {
      method: 'POST',
      body: { email: 'mara@example.de' },
    })
  })

  it('startOtp rejects phone identifiers (email-only backend)', async () => {
    const { result } = renderHook(() => useOnboardingAuth())
    await expect(
      act(() => result.current.startOtp('+4915112345678')),
    ).rejects.toThrow(/phone/i)
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('verifyOtp posts {email, code} and stores the returned token', async () => {
    mockApi
      .mockResolvedValueOnce({ ok: true }) // request
      .mockResolvedValueOnce({
        token: 'jwt-abc',
        user: { id: 'u1', clerkId: 'c1', email: 'mara@example.de', name: 'Mara' },
      })
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.startOtp('mara@example.de'))
    await act(() => result.current.verifyOtp('123456'))
    expect(mockApi).toHaveBeenLastCalledWith('/auth/otp/verify', {
      method: 'POST',
      body: { email: 'mara@example.de', code: '123456' },
    })
    expect(mockSetSessionToken).toHaveBeenCalledWith('jwt-abc')
  })

  it('verifyOtp throws (and stores nothing) when the backend rejects the code', async () => {
    mockApi
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('bad code'))
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.startOtp('mara@example.de'))
    await expect(act(() => result.current.verifyOtp('000000'))).rejects.toThrow()
    expect(mockSetSessionToken).not.toHaveBeenCalled()
  })

  it('verifyOtp requires startOtp to have run first', async () => {
    const { result } = renderHook(() => useOnboardingAuth())
    await expect(act(() => result.current.verifyOtp('123456'))).rejects.toThrow()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('completeSignUpIfReady reports activated with no missing fields', async () => {
    const { result } = renderHook(() => useOnboardingAuth())
    let outcome: { activated: boolean; missingFields: string[] } | undefined
    await act(async () => {
      outcome = await result.current.completeSignUpIfReady()
    })
    expect(outcome).toEqual({ activated: true, missingFields: [] })
  })

  it('setBasicProfile + finalizeSession are no-ops that resolve', async () => {
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.setBasicProfile({ firstName: 'Mara' }))
    await act(() => result.current.finalizeSession())
    // No API calls — profile is persisted via PATCH /me downstream.
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('keeps the identifier classifier/normalizer behaviour for the UI', () => {
    expect(classifyIdentifier('Mara@Example.DE')).toBe('email')
    expect(classifyIdentifier('0151 12345678')).toBe('phone')
    expect(normalizeIdentifier('Mara@Example.DE', 'email')).toBe('mara@example.de')
  })
})
