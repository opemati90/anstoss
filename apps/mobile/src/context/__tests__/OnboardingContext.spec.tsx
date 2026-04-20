// apps/mobile/src/context/__tests__/OnboardingContext.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { Text, Pressable } from 'react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../OnboardingContext'

// Note: RN 0.76 new architecture does not expose onPress on RNTL .props for
// Pressable or TouchableOpacity — we use fireEvent.press (RNTL public API) to
// trigger press events instead of calling .props.onPress() directly.
function Probe() {
  const { draft, setRole, setProfile } = useOnboardingDraft()
  return (
    <>
      <Text testID="role">{draft.registrationRole ?? 'NONE'}</Text>
      <Text testID="name">{draft.profile.displayName}</Text>
      <Pressable
        testID="set-role"
        onPress={() => setRole(RegistrationRole.CLUB_ADMIN)}
      >
        <Text>set</Text>
      </Pressable>
      <Pressable
        testID="set-profile"
        onPress={() =>
          setProfile({ displayName: 'Max', dateOfBirth: '1999-01-01', photoUrl: null })
        }
      >
        <Text>profile</Text>
      </Pressable>
    </>
  )
}

describe('OnboardingContext', () => {
  it('persists role and profile updates across renders', () => {
    const { getByTestId } = render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    )

    expect(getByTestId('role').props.children).toBe('NONE')
    fireEvent.press(getByTestId('set-role'))
    expect(getByTestId('role').props.children).toBe(RegistrationRole.CLUB_ADMIN)

    fireEvent.press(getByTestId('set-profile'))
    expect(getByTestId('name').props.children).toBe('Max')
  })

  it('throws if used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    function OrphanProbe() {
      useOnboardingDraft()
      return null
    }
    expect(() => render(<OrphanProbe />)).toThrow(
      /OnboardingProvider/,
    )
    spy.mockRestore()
  })
})
