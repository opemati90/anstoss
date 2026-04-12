import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { BackHandler, Pressable } from 'react-native'
import InviteScreen from '../invite'

const mockDismissTo = jest.fn()
const mockAddEventListener = jest.spyOn(BackHandler, 'addEventListener')
const mockAuthState = {
  activeClub: {
    club: {
      id: 'club-1',
      name: 'FC QA',
    },
  },
  activeTeamId: 'team-1',
}
const mockClubColors = {
  clubPrimary: '#1E3A5F',
  clubPrimaryLight: '#DDE7F1',
}
const translationMap: Record<string, string> = {
  'invite.screenTitle': 'Spieler einladen',
  'invite.operationalEyebrow': 'EINLADUNGEN',
  'invite.composerTitle': 'Zugang gezielt vergeben',
  'invite.composerSubtitle': 'Subtitle',
  'invite.teamLabel': 'Mannschaft',
  'invite.roleLabel': 'Rolle',
  'invite.phaseLabel': 'Zugang',
  'invite.recipientLabel': 'Empfaenger',
  'invite.sendEmail': 'Per E-Mail senden',
  'invite.shareLink': 'Link teilen',
  'invite.rolePlayer': 'Spieler',
  'invite.roleParent': 'Elternteil',
  'invite.phaseFull': 'Voller Zugang',
  'invite.phaseFullDescription': 'Regulaerer Teamzugang',
  'invite.phaseTrial': 'Probetraining',
  'invite.phaseTrialDescription': 'Begrenzter Zugang',
  'invite.recipientPlaceholder': 'name@beispiel.de',
  'invite.guardianPlaceholder': 'guardian@example.com',
  'invite.summaryLabel': 'Zusammenfassung',
  'invite.childUnassignedShort': 'Kind offen',
}
const mockT = (key: string) => translationMap[key] ?? key

jest.mock('expo-router', () => ({
  router: {
    dismissTo: (...args: any[]) => mockDismissTo(...args),
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({
    returnTo: '/(tabs)/more',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockClubColors,
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/team-groups')) {
      return Promise.resolve([
        {
          id: 'group-1',
          displayName: 'Herren',
          teams: [
            {
              id: 'team-1',
              displayName: 'Herren I',
              squadLabel: null,
              leagueName: null,
            },
          ],
        },
      ])
    }

    if (path.includes('/members')) {
      return Promise.resolve([])
    }

    return Promise.resolve(undefined)
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('InviteScreen dismissal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAddEventListener.mockImplementation((_eventName: any, handler: any) => ({
      remove: jest.fn(),
      handler,
    }) as any)
  })

  afterAll(() => {
    mockAddEventListener.mockRestore()
  })

  it('dismisses to the provided return route from the close button and Android back', async () => {
    let tree: ReturnType<typeof renderer.create>
    let backHandler: (() => boolean) | undefined

    mockAddEventListener.mockImplementation((_eventName: any, handler: any) => {
      backHandler = handler
      return { remove: jest.fn() } as any
    })

    await act(async () => {
      tree = renderer.create(<InviteScreen />)
    })

    act(() => {
      tree!.root.findAllByType(Pressable)[0]?.props.onPress()
    })

    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/more')

    act(() => {
      expect(backHandler?.()).toBe(true)
    })

    expect(mockDismissTo).toHaveBeenCalledTimes(2)
    expect(mockDismissTo).toHaveBeenNthCalledWith(2, '/(tabs)/more')
  })
})
