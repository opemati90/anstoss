import { renderHook, act } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingFlowProvider, useOnboardingFlow } from '../OnboardingFlowContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingFlowProvider>{children}</OnboardingFlowProvider>
)

describe('OnboardingFlowContext', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    expect(result.current.state).toEqual({})
  })

  it('records phone, name, dob, role across calls', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ phone: '+4915112345678' }))
    act(() => result.current.update({ firstName: 'Mara' }))
    act(() => result.current.update({ dateOfBirth: '2010-04-26' }))
    act(() => result.current.update({ role: RegistrationRole.PLAYER }))
    expect(result.current.state).toEqual({
      phone: '+4915112345678',
      firstName: 'Mara',
      dateOfBirth: '2010-04-26',
      role: 'PLAYER',
    })
  })

  it('reset() clears state', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ firstName: 'X' }))
    act(() => result.current.reset())
    expect(result.current.state).toEqual({})
  })
})
