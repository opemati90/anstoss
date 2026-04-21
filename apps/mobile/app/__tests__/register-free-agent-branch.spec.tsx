// apps/mobile/app/__tests__/register-free-agent-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import FreeAgentBranch from '../register/free-agent'
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
  useEffect(() => { setRole(RegistrationRole.FREE_AGENT) }, [setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return (
    <>
      <Text testID="positions">{(draft.freeAgent?.position ?? []).join(',')}</Text>
      <Text testID="city">{draft.freeAgent?.location ?? ''}</Text>
      <Text testID="years">{String(draft.freeAgent?.experienceYears ?? '')}</Text>
    </>
  )
}

describe('register/free-agent (Step 2 FREE_AGENT)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires at least one position and location before continue', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole />
        <FreeAgentBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.press(getByText(/^midfielder$/i))
    fireEvent.changeText(getByPlaceholderText(/city/i), 'Berlin')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists chosen positions and fields', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole />
        <FreeAgentBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/^defender$/i))
    fireEvent.press(getByText(/^forward$/i))
    fireEvent.changeText(getByPlaceholderText(/city/i), 'Munich')
    fireEvent.changeText(getByPlaceholderText(/years of experience/i), '5')
    fireEvent.press(getByText(/continue/i))

    expect(getByTestId('positions').props.children).toBe('DEF,FWD')
    expect(getByTestId('city').props.children).toBe('Munich')
    expect(getByTestId('years').props.children).toBe('5')
  })
})
