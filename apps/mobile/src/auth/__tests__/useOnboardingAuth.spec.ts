import { renderHook, act } from '@testing-library/react-native'

const mockCreate = jest.fn()
const mockPrepare = jest.fn()
const mockAttempt = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@clerk/clerk-expo', () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockCreate,
      preparePhoneNumberVerification: mockPrepare,
      attemptPhoneNumberVerification: mockAttempt,
      update: mockUpdate,
      createdSessionId: 'sess_1',
    },
    setActive: jest.fn(),
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
    mockCreate.mockReset(); mockPrepare.mockReset(); mockAttempt.mockReset(); mockUpdate.mockReset()
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
})
