// apps/mobile/app/__tests__/register-club-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import ClubBranch from '../register/club'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('../../src/components/BadgeUploadPicker', () => {
  const { Pressable, Text } = require('react-native')
  return {
    BadgeUploadPicker: ({ onImagePicked }: { onImagePicked: (uri: string) => void }) => (
      <Pressable testID="badge-picker" onPress={() => onImagePicked('https://cdn/badge.png')}>
        <Text>pick</Text>
      </Pressable>
    ),
  }
})

function SetRole({ role }: { role: RegistrationRole }) {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(role) }, [role, setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return (
    <>
      <Text testID="club-name">{draft.clubCreate?.name ?? ''}</Text>
      <Text testID="team-name">{draft.clubCreate?.firstTeamName ?? ''}</Text>
      <Text testID="primary">{draft.clubCreate?.primaryColor ?? ''}</Text>
    </>
  )
}

describe('register/club (Step 2 CLUB_ADMIN)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires club name and first-team name before continue', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.CLUB_ADMIN} />
        <ClubBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/club name/i), 'FC Musterstadt')
    fireEvent.changeText(getByPlaceholderText(/first team/i), 'Herren')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists draft entries and routes forward', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.CLUB_ADMIN} />
        <ClubBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/club name/i), 'SC Sample')
    fireEvent.changeText(getByPlaceholderText(/first team/i), 'Herren 1')
    fireEvent.press(getByText(/continue/i))

    expect(getByTestId('club-name').props.children).toBe('SC Sample')
    expect(getByTestId('team-name').props.children).toBe('Herren 1')
    expect(getByTestId('primary').props.children).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
