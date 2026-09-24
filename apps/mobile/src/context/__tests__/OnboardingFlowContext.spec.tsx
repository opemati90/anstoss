import { renderHook, act } from '@testing-library/react-native'
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
})
