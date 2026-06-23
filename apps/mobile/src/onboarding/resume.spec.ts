import { RegistrationRole } from '@anstoss/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { renderHook, waitFor } from '@testing-library/react-native'
import {
  ONBOARDING_FLOW_STORAGE_KEY,
} from '../context/OnboardingFlowContext'
import {
  resolveOnboardingResumeTarget,
  shouldDiscardOnboardingResumeState,
  useOnboardingResumeTarget,
} from './resume'

describe('resolveOnboardingResumeTarget', () => {
  it('resumes the final onboarding action screen after a cold start', () => {
    expect(
      resolveOnboardingResumeTarget(
        {
          ownerUserId: 'clerk-1',
          firstName: 'Mara',
          dateOfBirth: '1997-04-12',
          role: RegistrationRole.FREE_AGENT,
          lastStep: '/(auth)/done',
        },
        'clerk-1',
      ),
    ).toBe('/(auth)/done')
  })

  it('ignores saved state from another Clerk user', () => {
    const state = {
      ownerUserId: 'other',
      firstName: 'Mara',
      lastStep: '/(auth)/done',
    }

    expect(resolveOnboardingResumeTarget(state, 'clerk-1')).toBeNull()
    expect(shouldDiscardOnboardingResumeState(state, 'clerk-1')).toBe(true)
  })

  it('falls back by role when the saved path is not resumable', () => {
    expect(
      resolveOnboardingResumeTarget(
        {
          ownerUserId: 'clerk-1',
          role: RegistrationRole.CLUB_ADMIN,
          lastStep: '/(auth)/welcome',
        },
        'clerk-1',
      ),
    ).toBe('/(auth)/club-create')
  })
})

describe('useOnboardingResumeTarget', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockReset()
    jest.mocked(AsyncStorage.removeItem).mockReset()
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue()
  })

  it('purges an onboarding draft owned by another Clerk user', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({
        ownerUserId: 'other-clerk',
        firstName: 'Mara',
        role: RegistrationRole.CLUB_ADMIN,
        lastStep: '/(auth)/club-create',
      }),
    )

    const { result } = renderHook(() =>
      useOnboardingResumeTarget(true, 'clerk-current'),
    )

    await waitFor(() => expect(result.current).toBeNull())
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      ONBOARDING_FLOW_STORAGE_KEY,
    )
  })
})
