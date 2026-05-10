import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Pressable, Text } from 'react-native'
import { ClubSwitcher } from '../ClubSwitcher'

const mockSetActiveClub = jest.fn()
const mockPush = jest.fn()
let mockMemberships: any[] = []
let mockActiveClub: any = null

jest.useFakeTimers()

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'clubSwitcher.title': 'Switch Club',
        'clubSwitcher.current': 'Current',
        'roles.OWNER': 'Owner',
        'roles.COACH': 'Coach',
        'adminDashboard.title': 'Administration',
        'notificationSettings.title': 'Notifications',
        'more.title': 'More',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
  },
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    memberships: mockMemberships,
    activeClub: mockActiveClub,
    setActiveClub: mockSetActiveClub,
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#D50000',
    clubPrimaryLight: '#FFEBEE',
  }),
  useIsDark: () => false,
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

// ClubSwitcher uses `useSafeAreaInsets()` to compute the sheet's bottom
// padding so it clears the home indicator without leaving a visible gap
// below the sheet. Stub it for the test renderer (no SafeAreaProvider).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

function collectText(node: any): string {
  if (typeof node === 'string') return node
  if (!node?.children) return ''
  return node.children.map((c: any) => collectText(c)).join('')
}

function renderWithAct(element: React.ReactElement) {
  let tree: any
  act(() => {
    tree = renderer.create(element)
  })
  act(() => {
    jest.runAllTimers()
  })
  return tree!
}

describe('ClubSwitcher', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveClub = {
      club: { id: 'club-1', name: 'FC Test', badgeUrl: null, primaryColor: '#1A1A18' },
      role: 'OWNER',
    }
    mockMemberships = [
      mockActiveClub,
      {
        club: { id: 'club-2', name: 'SV Muster', badgeUrl: null, primaryColor: '#2563A0' },
        role: 'COACH',
      },
    ]
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
  })

  it('renders the current club sheet even when there is only one club', () => {
    mockMemberships = [mockActiveClub]

    const tree = renderWithAct(
      <ClubSwitcher visible={true} onClose={onClose} />,
    )

    const textValues = tree.root.findAllByType(Text).map((node: any) => collectText(node))

    expect(textValues).toContain('FC Test')
    expect(textValues).toContain('Owner')
    expect(textValues).toContain('Administration')
    expect(textValues).toContain('Notifications')
  })

  it('renders club rows with names and roles', () => {
    const tree = renderWithAct(
      <ClubSwitcher visible={true} onClose={onClose} />,
    )

    const allTexts = tree.root.findAllByType(Text)
    const textValues = allTexts.map((t: any) => collectText(t))

    expect(textValues).toContain('Switch Club')
    expect(textValues).toContain('FC Test')
    expect(textValues).toContain('SV Muster')
    expect(textValues).toContain('Owner')
    expect(textValues).toContain('Coach')
  })

  it('shows badge initial when no badgeUrl', () => {
    const tree = renderWithAct(
      <ClubSwitcher visible={true} onClose={onClose} />,
    )

    const allTexts = tree.root.findAllByType(Text)
    const textValues = allTexts.map((t: any) => collectText(t))

    expect(textValues).toContain('F') // FC Test initial
    expect(textValues).toContain('S') // SV Muster initial
  })

  it('calls setActiveClub and onClose when a club is selected', () => {
    const tree = renderWithAct(
      <ClubSwitcher visible={true} onClose={onClose} />,
    )

    const pressables = tree.root.findAllByType(Pressable)
    const clubRows = pressables.filter((p: any) => {
      try {
        const directTexts = p.findAllByType(Text)
        return directTexts.some((t: any) => collectText(t) === 'SV Muster')
      } catch {
        return false
      }
    })

    const clubRow = clubRows[clubRows.length - 1]
    expect(clubRow).toBeTruthy()

    act(() => {
      clubRow.props.onPress()
    })

    expect(mockSetActiveClub).toHaveBeenCalledWith(mockMemberships[1])
    expect(onClose).toHaveBeenCalled()
  })

  it('opens a club action from the sheet', () => {
    mockMemberships = [mockActiveClub]

    const tree = renderWithAct(
      <ClubSwitcher visible={true} onClose={onClose} />,
    )

    const actionRow = tree.root.findByProps({
      testID: 'club-switcher-primary-action',
    })

    expect(actionRow).toBeTruthy()

    act(() => {
      actionRow.props.onPress()
    })

    expect(mockPush).toHaveBeenCalledWith('/admin-dashboard')
    expect(onClose).toHaveBeenCalled()
  })
})
