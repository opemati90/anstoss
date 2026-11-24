import { renderHook, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OnboardingFlowProvider, useOnboardingFlow } from '../OnboardingFlowContext'

jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingFlowProvider>{children}</OnboardingFlowProvider>
)

describe('OnboardingFlowContext', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    expect(result.current.state).toEqual({})
  })

  it('stamps the owner on every club-setup draft update', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ clubName: 'SV Albatros' }))
    act(() => result.current.update({ teamName: 'Herren II' }))
    expect(result.current.state).toEqual({
      ownerUserId: 'user-1',
      clubName: 'SV Albatros',
      teamName: 'Herren II',
    })
  })

  it('reset() clears state', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ clubName: 'X' }))
    act(() => result.current.reset())
    expect(result.current.state).toEqual({})
  })

  it('reset wins over an old draft still loading from storage', async () => {
    let finishRead!: (value: string | null) => void
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(
      () => new Promise((resolve) => { finishRead = resolve }),
    )
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.reset())
    await act(async () => finishRead(JSON.stringify({
      ownerUserId: 'user-1', clubName: 'Abandoned club', lastStep: '/(auth)/club-setup',
    })))
    expect(result.current.hydrating).toBe(false)
    expect(result.current.state).toEqual({})
  })
})
