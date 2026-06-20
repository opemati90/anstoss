import { renderHook, act } from '@testing-library/react-native'

const mockCreate = jest.fn()
const mockPrepare = jest.fn()
const mockAttempt = jest.fn()
const mockUpdate = jest.fn()
const mockSetActive = jest.fn()
const signUpState: { status: string; createdSessionId?: string; missingFields: string[] } = {
  status: 'complete',
  createdSessionId: 'sess_1',
  missingFields: [],
}

jest.mock('@clerk/clerk-expo', () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockCreate,
      preparePhoneNumberVerification: mockPrepare,
      attemptPhoneNumberVerification: mockAttempt,
      update: mockUpdate,
      get status() {
        return signUpState.status
      },
      get createdSessionId() {
        return signUpState.createdSessionId
      },
      get missingFields() {
        return signUpState.missingFields
      },
    },
    setActive: mockSetActive,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: jest.fn(),
      prepareFirstFactor: jest.fn(),
      attemptFirstFactor: jest.fn(),
      createdSessionId: undefined,
      supportedFirstFactors: [],
    },
    setActive: jest.fn(),
  }),
}))

import { useOnboardingAuth } from '../useOnboardingAuth'

describe('useOnboardingAuth', () => {
  beforeEach(() => {
    mockCreate.mockReset(); mockPrepare.mockReset(); mockAttempt.mockReset(); mockUpdate.mockReset(); mockSetActive.mockReset()
    signUpState.status = 'complete'; signUpState.createdSessionId = 'sess_1'; signUpState.missingFields = []
  })

  it('startPhoneOtp creates signUp + preps phone verification', async () => {
    mockCreate.mockResolvedValue(undefined)
    mockPrepare.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.startPhoneOtp('+4915112345678'))
    expect(mockCreate).toHaveBeenCalledWith({ phoneNumber: '+4915112345678' })
    expect(mockPrepare).toHaveBeenCalledWith({ strategy: 'phone_code' })
  })

  it('verifyPhoneOtp attempts verification with the code', async () => {
    mockAttempt.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.verifyPhoneOtp('123456'))
    expect(mockAttempt).toHaveBeenCalledWith({ code: '123456' })
  })

  it('setBasicProfile patches signUp with first name', async () => {
    mockUpdate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.setBasicProfile({ firstName: 'Mara' }))
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Mara' })
  })

  it('completeSignUpIfReady activates the session when the signUp is complete', async () => {
    mockSetActive.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    let outcome: { activated: boolean; missingFields: string[] } | undefined
    await act(async () => {
      outcome = await result.current.completeSignUpIfReady()
    })
    expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_1' })
    expect(outcome).toEqual({ activated: true, missingFields: [] })
  })

  it('completeSignUpIfReady activates once Clerk has created a session even if status is stale', async () => {
    signUpState.status = 'missing_requirements'
    signUpState.createdSessionId = 'sess_stale_status'
    signUpState.missingFields = ['first_name']
    mockSetActive.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    let outcome: { activated: boolean; missingFields: string[] } | undefined
    await act(async () => {
      outcome = await result.current.completeSignUpIfReady()
    })
    expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_stale_status' })
    expect(outcome).toEqual({ activated: true, missingFields: [] })
  })

  it('completeSignUpIfReady reports missing fields and does not activate when incomplete', async () => {
    signUpState.status = 'missing_requirements'
    signUpState.createdSessionId = undefined
    signUpState.missingFields = ['first_name']
    const { result } = renderHook(() => useOnboardingAuth())
    let outcome: { activated: boolean; missingFields: string[] } | undefined
    await act(async () => {
      outcome = await result.current.completeSignUpIfReady()
    })
    expect(mockSetActive).not.toHaveBeenCalled()
    expect(outcome).toEqual({ activated: false, missingFields: ['first_name'] })
  })
})
