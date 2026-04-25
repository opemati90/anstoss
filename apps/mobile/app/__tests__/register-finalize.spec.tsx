// apps/mobile/app/__tests__/register-finalize.spec.tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import FinalizeScreen from '../register/finalize'
import { useEffect } from 'react'

const mockReplace = jest.fn()
const mockApi = jest.fn()
const mockRefreshUser = jest.fn(() => Promise.resolve())

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function SeedClubAdminDraft() {
  const { setRole, setClubCreate } = useOnboardingDraft()
  useEffect(() => {
    setRole(RegistrationRole.CLUB_ADMIN)
    setClubCreate({
      name: 'FC Musterstadt',
      primaryColor: '#1E3A5F',
      firstTeamName: 'Herren 1',
    })
  }, [setRole, setClubCreate])
  return null
}

describe('register/finalize (Step 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockResolvedValue({ user: { id: 'u1' } })
  })

  it('submits the full discriminated-union payload on complete', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/display name/i), 'Max Mustermann')
    fireEvent.changeText(getByPlaceholderText(/date of birth/i), '01.01.1999')
    fireEvent.press(getByText(/finish/i))

    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1))
    expect(mockApi).toHaveBeenCalledWith('/me/onboarding', {
      method: 'POST',
      body: {
        registrationRole: 'CLUB_ADMIN',
        profile: {
          displayName: 'Max Mustermann',
          dateOfBirth: '1999-01-01',
        },
        clubCreate: {
          name: 'FC Musterstadt',
          primaryColor: '#1E3A5F',
          firstTeamName: 'Herren 1',
        },
      },
    })
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled())
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('blocks submit when display name or DOB missing', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/finish/i))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('shows inline error when API rejects', async () => {
    const { ApiError } = jest.requireMock('../../src/api/client') as { ApiError: new (m?: string) => Error }
    mockApi.mockRejectedValueOnce(new ApiError('Invite code invalid'))

    const { getByText, getByPlaceholderText, findByText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/display name/i), 'Max')
    fireEvent.changeText(getByPlaceholderText(/date of birth/i), '01.01.1999')
    fireEvent.press(getByText(/finish/i))

    expect(await findByText(/Invite code invalid/)).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
