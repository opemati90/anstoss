import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  FreeAgentHome,
  computeCompleteness,
  getFreeAgentNextAction,
  type FreeAgentProfile,
} from '../../src/components/home/FreeAgentHome'
import { api } from '../../src/api/client'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('react-i18next', () => {
  const map: Record<string, string> = {
    'home.freeAgent.nextActionEyebrow': 'FREE AGENT NEXT ACTION',
    'home.freeAgent.loadingTitle': 'Checking your player profile',
    'home.freeAgent.loadingBody':
      'We are finding your free-agent status before showing the next step.',
    'home.freeAgent.loadingA11y': 'Checking your free agent player profile',
    'home.freeAgent.loadErrorTitle': "Couldn't load your player profile",
    'home.freeAgent.loadErrorBody':
      'Keep your current setup intact and try again before creating anything new.',
    'home.freeAgent.retryLoadCta': 'Try again',
    'home.freeAgent.retryLoadA11y': 'Try loading your free agent player profile again',
    'home.freeAgent.createProfileTitle': 'Create your player profile',
    'home.freeAgent.createProfileBody':
      'Add position, city, and a short football note so clubs know where you fit.',
    'home.freeAgent.createProfileCta': 'Create profile',
    'home.freeAgent.createProfileA11y': 'Create your free agent player profile',
    'home.freeAgent.completeProfileTitle': 'Finish your player profile',
    'home.freeAgent.completeProfileBody':
      '{{pct}}% complete. Add the missing details before sharing it with coaches.',
    'home.freeAgent.completeProfileCta': 'Update profile',
    'home.freeAgent.completeProfileA11y': 'Update your free agent player profile',
    'home.freeAgent.enableTrialsTitle': 'Switch on trial availability',
    'home.freeAgent.enableTrialsBody':
      'Your profile is complete, but clubs need to see you are open to sessions.',
    'home.freeAgent.enableTrialsCta': 'Open profile',
    'home.freeAgent.enableTrialsA11y': 'Open profile to switch on trial availability',
    'home.freeAgent.shareCardTitle': 'Share your player card',
    'home.freeAgent.shareCardBody':
      'Your listing is ready. Send it to coaches while you wait for trial invites.',
    'home.freeAgent.shareCardCta': 'Open player card',
    'home.freeAgent.shareCardA11y': 'Open your player card to share',
    'home.freeAgent.progressLabel': '{{pct}}% ready',
    'home.freeAgent.trialInvites': 'Trial invites',
    'home.freeAgent.trialEmptyTitle': 'No trial invites yet',
    'home.freeAgent.trialEmptyBody': 'Invites land here when a club views your profile.',
  }
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = map[key] ?? key
    return Object.entries(opts ?? {}).reduce(
      (text, [nextKey, value]) =>
        text.replaceAll(`{{${nextKey}}}`, value == null ? '' : String(value)),
      template,
    )
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

const mockedApi = api as jest.MockedFunction<typeof api>
const mockedPush = router.push as jest.Mock

const completeProfile: FreeAgentProfile = {
  displayName: 'Lea',
  position: ['ST'],
  experienceYears: 3,
  location: 'Berlin',
  availableForTrials: true,
  bio: 'Fast winger who can press high.',
}

function mockProfile(profile: FreeAgentProfile | null) {
  mockedApi.mockImplementation((path: string) => {
    if (path.includes('/me/free-agent-profile')) {
      return Promise.resolve(profile) as ReturnType<typeof api>
    }
    return Promise.resolve(null) as ReturnType<typeof api>
  })
}

function mockProfileFailure() {
  mockedApi.mockRejectedValue(new Error('network down'))
}

function mockProfilePending() {
  mockedApi.mockImplementation((path: string) => {
    if (path.includes('/me/free-agent-profile')) {
      return new Promise(() => undefined) as ReturnType<typeof api>
    }
    return Promise.resolve(null) as ReturnType<typeof api>
  })
}

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

describe('FreeAgentHome', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedPush.mockReset()
    mockProfile({ ...completeProfile, bio: '' })
  })

  it('counts zero years of experience as a filled profile field', () => {
    expect(
      computeCompleteness({
        ...completeProfile,
        experienceYears: 0,
      }),
    ).toBe(100)
  })

  it('prioritizes profile creation when the free-agent profile does not exist', async () => {
    mockProfile(null)

    const { findByLabelText, findByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText('Create your player profile')).toBeTruthy()
    fireEvent.press(await findByLabelText('Create your free agent player profile'))

    expect(mockedPush).toHaveBeenCalledWith('/free-agent/profile')
  })

  it('shows a stable loading panel while profile state is unknown', async () => {
    mockProfilePending()

    const { findByLabelText, getByTestId, queryByText } = render(wrap(<FreeAgentHome />))

    expect(await findByLabelText('Checking your free agent player profile')).toBeTruthy()
    expect(getByTestId('free-agent-loading-action-placeholder')).toBeTruthy()
    expect(queryByText('Create your player profile')).toBeNull()
    expect(queryByText('Finish your player profile')).toBeNull()
  })

  it('does not tell existing players to create a profile when loading fails', async () => {
    mockProfileFailure()

    const { findByLabelText, findByText, queryByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText("Couldn't load your player profile")).toBeTruthy()
    expect(
      await findByLabelText(
        /Couldn't load your player profile\. Keep your current setup intact/i,
      ),
    ).toBeTruthy()
    expect(queryByText('Create your player profile')).toBeNull()

    mockProfile(completeProfile)
    fireEvent.press(await findByLabelText('Try loading your free agent player profile again'))

    expect(await findByText('Share your player card')).toBeTruthy()
  })

  it('prioritizes missing profile details before sharing', async () => {
    mockProfile({ ...completeProfile, experienceYears: 0, bio: '' })

    const { findByLabelText, findByText, queryByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText('Finish your player profile')).toBeTruthy()
    expect(await findByText(/80% complete/)).toBeTruthy()
    expect(await findByText('80% ready')).toBeTruthy()
    expect(queryByText('Share your player card')).toBeNull()
    fireEvent.press(await findByLabelText('Update your free agent player profile'))

    expect(mockedPush).toHaveBeenCalledWith('/free-agent/profile')
  })

  it('asks complete profiles to switch on trial availability before sharing', async () => {
    mockProfile({ ...completeProfile, availableForTrials: false })

    const { findByLabelText, findByText, queryByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText('Switch on trial availability')).toBeTruthy()
    expect(queryByText('Share your player card')).toBeNull()
    fireEvent.press(await findByLabelText('Open profile to switch on trial availability'))

    expect(mockedPush).toHaveBeenCalledWith('/free-agent/profile')
  })

  it('surfaces sharing as the next action once the profile is complete and visible', async () => {
    mockProfile(completeProfile)

    const { findByLabelText, findByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText('Share your player card')).toBeTruthy()
    expect(await findByText(/Your listing is ready/)).toBeTruthy()
    fireEvent.press(await findByLabelText('Open your player card to share'))

    expect(mockedPush).toHaveBeenCalledWith('/free-agent/profile')
  })

  it('keeps the trial invite inbox visible below the primary action', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))

    expect(await findByText(/No trial invites yet/i)).toBeTruthy()
  })

  it('chooses the same next action outside React for edge-case tests', () => {
    expect(getFreeAgentNextAction(null, 0).kind).toBe('create-profile')
    expect(getFreeAgentNextAction({ ...completeProfile, bio: '' }, 80).kind).toBe(
      'complete-profile',
    )
    expect(
      getFreeAgentNextAction({ ...completeProfile, availableForTrials: false }, 100)
        .kind,
    ).toBe('enable-trials')
    expect(getFreeAgentNextAction(completeProfile, 100).kind).toBe('share-card')
  })
})
