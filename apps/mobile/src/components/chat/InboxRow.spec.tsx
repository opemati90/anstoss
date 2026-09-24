import { fireEvent, render } from '@testing-library/react-native'
import type { InboxItem } from '@anstoss/shared'
import { InboxRow } from './InboxRow'

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react')
  const { View } = require('react-native')
  const Swipeable = React.forwardRef(
    (
      props: { children: unknown; renderLeftActions?: () => unknown; renderRightActions?: () => unknown },
      _ref: unknown,
    ) => (
      <View>
        {props.renderLeftActions ? props.renderLeftActions() : null}
        {props.children}
        {props.renderRightActions ? props.renderRightActions() : null}
      </View>
    ),
  )
  return { __esModule: true, default: Swipeable }
})

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'de' } }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#111111',
    primary50: '#eeeeee',
    background: '#ffffff',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textTertiary: '#777777',
    textInverse: '#ffffff',
    surface: '#ffffff',
    surfaceSunken: '#f4f4f4',
    borderDefault: '#dddddd',
    borderStrong: '#999999',
    borderSubtle: '#eeeeee',
    error: '#b00020',
  }),
}))

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    type: 'DM',
    id: 'c-1',
    teamId: null,
    teamName: null,
    kind: 'DM',
    title: 'Tim Weber',
    avatarUrl: null,
    otherUserId: 'u-2',
    canWrite: true,
    muted: false,
    mutedUntil: null,
    unreadCount: 2,
    lastMessage: null,
    activityAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderRow(i: InboxItem, typing = false) {
  const handlers = {
    onPress: jest.fn(),
    onLongPress: jest.fn(),
    onToggleMute: jest.fn(),
    onMarkRead: jest.fn(),
  }
  const screen = render(
    <InboxRow item={i} title="Tim Weber" subtitle={null} preview="chatInbox.typing" typing={typing} {...handlers} />,
  )
  return { screen, handlers }
}

describe('InboxRow', () => {
  it('marks the preview as the typing line while someone types', () => {
    const { screen } = renderRow(item(), true)
    expect(screen.getByTestId('inbox-row-c-1-typing')).toBeTruthy()
  })

  it('swipe actions: Gelesen marks read, Stumm mutes', () => {
    const { screen, handlers } = renderRow(item())
    fireEvent.press(screen.getByTestId('inbox-row-c-1-read'))
    expect(handlers.onMarkRead).toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('inbox-row-c-1-mute'))
    expect(handlers.onToggleMute).toHaveBeenCalled()
  })

  it('offers no Gelesen action when nothing is unread (no fake "mark unread")', () => {
    const { screen } = renderRow(item({ unreadCount: 0 }))
    expect(screen.queryByTestId('inbox-row-c-1-read')).toBeNull()
  })
})
