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

  it('persists clubCreate, join, parentLink, and freeAgent through their setters', () => {
    function SetterProbe() {
      const { draft, setClubCreate, setJoin, setParentLink, setFreeAgent } = useOnboardingDraft()
      const React = require('react')
      const { Text, Pressable } = require('react-native')
      return React.createElement(React.Fragment, null,
        React.createElement(Text, { testID: 'club' }, draft.clubCreate?.name ?? ''),
        React.createElement(Text, { testID: 'join' }, draft.join?.inviteCode ?? ''),
        React.createElement(Text, { testID: 'parent' }, draft.parentLink?.approvalInviteCode ?? ''),
        React.createElement(Text, { testID: 'fa' }, (draft.freeAgent?.position ?? []).join(',')),
        React.createElement(Pressable, { testID: 'go', onPress: () => {
          setClubCreate({ name: 'FC X', primaryColor: '#111111', firstTeamName: 'Herren' })
          setJoin({ inviteCode: 'ABCD1234' })
          setParentLink({ approvalInviteCode: 'LINK9999' })
          setFreeAgent({ position: ['MID'], experienceYears: 3, location: 'Berlin', availableForTrials: true, bio: '' })
        }}, React.createElement(Text, null, 'go')),
      )
    }
    const { getByTestId } = render(
      <OnboardingProvider>
        <SetterProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByTestId('go'))
    expect(getByTestId('club').props.children).toBe('FC X')
    expect(getByTestId('join').props.children).toBe('ABCD1234')
    expect(getByTestId('parent').props.children).toBe('LINK9999')
    expect(getByTestId('fa').props.children).toBe('MID')
  })

  it('reset() clears all fields back to empty', () => {
    function ResetProbe() {
      const { draft, setRole, setClubCreate, reset } = useOnboardingDraft()
      const React = require('react')
      const { Text, Pressable } = require('react-native')
      return React.createElement(React.Fragment, null,
        React.createElement(Text, { testID: 'role' }, draft.registrationRole ?? 'NONE'),
        React.createElement(Text, { testID: 'club' }, draft.clubCreate?.name ?? 'EMPTY'),
        React.createElement(Pressable, { testID: 'seed', onPress: () => {
          setRole(RegistrationRole.CLUB_ADMIN)
          setClubCreate({ name: 'FC Seed', primaryColor: '#222222', firstTeamName: 'Herren' })
        }}, React.createElement(Text, null, 'seed')),
        React.createElement(Pressable, { testID: 'reset', onPress: () => reset() },
          React.createElement(Text, null, 'reset')),
      )
    }
    const { getByTestId } = render(
      <OnboardingProvider>
        <ResetProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByTestId('seed'))
    expect(getByTestId('role').props.children).toBe(RegistrationRole.CLUB_ADMIN)
    expect(getByTestId('club').props.children).toBe('FC Seed')
    fireEvent.press(getByTestId('reset'))
    expect(getByTestId('role').props.children).toBe('NONE')
    expect(getByTestId('club').props.children).toBe('EMPTY')
  })

  it('setting role does not wipe previously-set club draft data', () => {
    function Probe2() {
      const { draft, setRole, setClubCreate } = useOnboardingDraft()
      const React = require('react')
      const { Text, Pressable } = require('react-native')
      return React.createElement(React.Fragment, null,
        React.createElement(Text, { testID: 'role' }, draft.registrationRole ?? 'NONE'),
        React.createElement(Text, { testID: 'club' }, draft.clubCreate?.name ?? ''),
        React.createElement(Pressable, { testID: 'seed', onPress: () => {
          setClubCreate({ name: 'FC Keep', primaryColor: '#333333', firstTeamName: 'H' })
        }}, React.createElement(Text, null, 'seed')),
        React.createElement(Pressable, { testID: 'role-later', onPress: () => setRole(RegistrationRole.CLUB_ADMIN) },
          React.createElement(Text, null, 'role')),
      )
    }
    const { getByTestId } = render(
      <OnboardingProvider>
        <Probe2 />
      </OnboardingProvider>,
    )
    fireEvent.press(getByTestId('seed'))
    fireEvent.press(getByTestId('role-later'))
    expect(getByTestId('role').props.children).toBe(RegistrationRole.CLUB_ADMIN)
    expect(getByTestId('club').props.children).toBe('FC Keep')
  })
})
