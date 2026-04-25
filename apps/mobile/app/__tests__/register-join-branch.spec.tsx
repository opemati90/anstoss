// apps/mobile/app/__tests__/register-join-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import JoinBranch from '../register/join'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function SetRole({ role }: { role: RegistrationRole }) {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(role) }, [role, setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return <Text testID="invite">{draft.join?.inviteCode ?? ''}</Text>
}

describe('register/join (Step 2 PLAYER/COACH)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires an invite code of at least 4 characters', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.PLAYER} />
        <JoinBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'abc')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'ABCD1234')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists invite code to draft', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.COACH} />
        <JoinBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'COACH99')
    fireEvent.press(getByText(/continue/i))
    expect(getByTestId('invite').props.children).toBe('COACH99')
  })
})
