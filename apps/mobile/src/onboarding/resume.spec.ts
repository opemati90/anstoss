import { RegistrationRole } from '@anstoss/shared'
import { resolveOnboardingResumeTarget } from './resume'

describe('resolveOnboardingResumeTarget', () => {
  it('resumes the final onboarding action screen after a cold start', () => {
    expect(
      resolveOnboardingResumeTarget(
        {
          ownerClerkId: 'clerk-1',
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
    expect(
      resolveOnboardingResumeTarget(
        {
          ownerClerkId: 'other',
          firstName: 'Mara',
          lastStep: '/(auth)/done',
        },
        'clerk-1',
      ),
    ).toBeNull()
  })

  it('falls back by role when the saved path is not resumable', () => {
    expect(
      resolveOnboardingResumeTarget(
        {
          ownerClerkId: 'clerk-1',
          role: RegistrationRole.CLUB_ADMIN,
          lastStep: '/(auth)/welcome',
        },
        'clerk-1',
      ),
    ).toBe('/(auth)/club-create')
  })
})
