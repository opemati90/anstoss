import AsyncStorage from '@react-native-async-storage/async-storage'
import { renderHook, waitFor } from '@testing-library/react-native'
import { ONBOARDING_FLOW_STORAGE_KEY } from './storageKeys'
import {
  resolveOnboardingResumeTarget,
  shouldDiscardOnboardingResumeState,
  useOnboardingResumeTarget,
} from './resume'

describe('resolveOnboardingResumeTarget', () => {
  it('resumes the club setup form for its owner', () => {
    expect(
      resolveOnboardingResumeTarget(
        { ownerUserId: 'user-1', clubName: 'SV Albatros', lastStep: '/(auth)/club-setup' },
        'user-1',
      ),
    ).toBe('/(auth)/club-setup')
  })

  it.each([
    '/(auth)/about',
    '/(auth)/role',
    '/(auth)/team-code',
    '/(auth)/roster-build',
    '/(auth)/roster-claim',
    '/(auth)/done',
    '/(auth)/welcome',
  ])('never resumes into a removed or non-resumable step (%s) and discards it', (lastStep) => {
    const state = { ownerUserId: 'user-1', lastStep }
    expect(resolveOnboardingResumeTarget(state, 'user-1')).toBeNull()
    expect(shouldDiscardOnboardingResumeState(state, 'user-1')).toBe(true)
  })

  it('ignores and discards a draft owned by another user', () => {
    const state = { ownerUserId: 'other', lastStep: '/(auth)/club-setup' }
    expect(resolveOnboardingResumeTarget(state, 'user-1')).toBeNull()
    expect(shouldDiscardOnboardingResumeState(state, 'user-1')).toBe(true)
  })
})

describe('useOnboardingResumeTarget', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockReset()
    jest.mocked(AsyncStorage.removeItem).mockReset()
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue()
  })

  it('purges a stale draft that points at a deleted screen', async () => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockResolvedValue(JSON.stringify({ ownerUserId: 'user-1', lastStep: '/(auth)/roster-claim' }))
    const { result } = renderHook(() => useOnboardingResumeTarget(true, 'user-1'))
    await waitFor(() => expect(result.current).toBeNull())
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ONBOARDING_FLOW_STORAGE_KEY)
  })

  it('stays undefined until storage answered, so index never routes early', () => {
    jest.mocked(AsyncStorage.getItem).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useOnboardingResumeTarget(true, 'user-1'))
    expect(result.current).toBeUndefined()
  })
})
