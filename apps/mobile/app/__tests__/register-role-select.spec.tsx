// apps/mobile/app/__tests__/register-role-select.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import RoleSelect from '../register/index'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const React = require('react')
  const { Text } = require('react-native')
  return React.createElement(Text, { testID: 'draft-role' }, draft.registrationRole ?? 'NONE')
}

describe('register/index (Step 1: role selection)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists all five role cards', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    expect(getByText(/starting a club/i)).toBeTruthy()
    expect(getByText(/joining a club/i)).toBeTruthy()
    expect(getByText(/coaching/i)).toBeTruthy()
    expect(getByText(/looking for a club/i)).toBeTruthy()
    expect(getByText(/my child plays/i)).toBeTruthy()
  })

  it('selecting CLUB_ADMIN and continuing routes to /register/club', () => {
    const { getByText, getByTestId } = render(
      <OnboardingProvider>
        <RoleSelect />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/starting a club/i))
    expect(getByTestId('draft-role').props.children).toBe('CLUB_ADMIN')

    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/club')
  })

  it('selecting FREE_AGENT routes to /register/free-agent', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/looking for a club/i))
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/free-agent')
  })

  it('continue is disabled when no role selected', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
