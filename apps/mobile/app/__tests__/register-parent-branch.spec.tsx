// apps/mobile/app/__tests__/register-parent-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import ParentBranch from '../register/parent'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function SetRole() {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(RegistrationRole.PARENT) }, [setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return <Text testID="code">{draft.parentLink?.approvalInviteCode ?? ''}</Text>
}

describe('register/parent (Step 2 PARENT)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires approval code of at least 4 chars', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole />
        <ParentBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'OK1')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'PARENT1234')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists code to draft', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole />
        <ParentBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'LINK9999')
    fireEvent.press(getByText(/continue/i))
    expect(getByTestId('code').props.children).toBe('LINK9999')
  })
})
