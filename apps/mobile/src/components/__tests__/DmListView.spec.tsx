import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native'
import { DmListView, useDmUnreadCount, type ConversationItem } from '../DmListView'

const mockApi = jest.fn()
const mockPush = jest.fn()
let mockActiveClub: { club: { id: string } } | null = { club: { id: 'club-1' } }

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: {
      push: (...args: any[]) => mockPush(...args),
    },
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback])
    },
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'states.dm.error.title': 'Could not load',
        'states.common.retry': 'Retry',
        'states.dm.empty.title': 'No messages',
        'states.dm.empty.body': 'Start a direct message.',
        'states.dm.empty.cta': 'Start a conversation',
        'dm.conversationWith': 'Conversation with',
        'dm.unknownUser': 'Unknown user',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../api/client', () => ({
  api: (...args: any[]) => mockApi(...args),
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: mockActiveClub,
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#FFFFFF',
    border: '#D0D5DD',
    clubPrimary: '#0055FF',
    clubPrimaryLight: '#EAF1FF',
    error: '#C62828',
    surface: '#FFFFFF',
    textInverse: '#FFFFFF',
    textPrimary: '#101828',
    textSecondary: '#475467',
    textTertiary: '#667085',
  }),
}))

jest.mock('../EmptyState', () => {
  const { Text, View } = require('react-native')
  return {
    EmptyState: ({ title, description }: { title: string; description: string }) => (
      <View>
        <Text>{title}</Text>
        <Text>{description}</Text>
      </View>
    ),
  }
})

const conversation = (
  overrides: Partial<ConversationItem> = {},
): ConversationItem => ({
  id: overrides.id ?? 'conversation-1',
  otherUser: 'otherUser' in overrides
    ? overrides.otherUser!
    : {
        id: 'user-2',
        name: 'Mina Meyer',
        avatarUrl: null,
      },
  lastMessage: 'lastMessage' in overrides
    ? overrides.lastMessage!
    : {
        content: 'See you at training',
        senderId: 'user-2',
        createdAt: new Date().toISOString(),
      },
  unreadCount: overrides.unreadCount ?? 2,
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
})

describe('DmListView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveClub = { club: { id: 'club-1' } }
  })

  it('loads conversations and navigates to the selected DM', async () => {
    mockApi.mockResolvedValueOnce([conversation()])

    const screen = render(<DmListView />)

    await waitFor(() => {
      expect(screen.getByText('Mina Meyer')).toBeTruthy()
      expect(screen.getByText('See you at training')).toBeTruthy()
      expect(screen.getByText('2')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Conversation with Mina Meyer'))

    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/conversations')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/dm-chat',
      params: {
        conversationId: 'conversation-1',
        userName: 'Mina Meyer',
      },
    })
  })

  it('renders empty and unknown-user states', async () => {
    mockApi.mockResolvedValueOnce([])

    const emptyScreen = render(<DmListView />)

    await waitFor(() => {
      expect(emptyScreen.getByText('No messages')).toBeTruthy()
      expect(emptyScreen.getByText('Start a direct message.')).toBeTruthy()
    })

    emptyScreen.unmount()
    mockApi.mockResolvedValueOnce([
      conversation({
        otherUser: null,
        lastMessage: null,
        unreadCount: 0,
      }),
    ])

    const unknownScreen = render(<DmListView />)

    await waitFor(() => {
      expect(unknownScreen.getByText('Unknown user')).toBeTruthy()
    })
  })

  it('shows an error state and retries the request', async () => {
    mockApi
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([conversation({ id: 'conversation-2', unreadCount: 0 })])

    const screen = render(<DmListView />)

    await waitFor(() => {
      expect(screen.getByText('Could not load')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('Mina Meyer')).toBeTruthy()
      expect(mockApi).toHaveBeenCalledTimes(2)
    })
  })

  it('refreshes the list from the FlatList control', async () => {
    mockApi
      .mockResolvedValueOnce([conversation({ id: 'conversation-1' })])
      .mockResolvedValueOnce([conversation({ id: 'conversation-2', unreadCount: 4 })])

    const screen = render(<DmListView />)

    await waitFor(() => expect(screen.getByText('Mina Meyer')).toBeTruthy())

    const refreshControl = screen.UNSAFE_getByProps({ refreshing: false })

    await act(async () => {
      refreshControl.props.onRefresh()
    })

    await waitFor(() => {
      expect(screen.getByText('4')).toBeTruthy()
      expect(mockApi).toHaveBeenCalledTimes(2)
    })
  })
})

describe('useDmUnreadCount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveClub = { club: { id: 'club-1' } }
  })

  it('sums unread conversations for the active club', async () => {
    mockApi.mockResolvedValueOnce([
      conversation({ id: 'conversation-1', unreadCount: 2 }),
      conversation({ id: 'conversation-2', unreadCount: 3 }),
    ])

    const { result } = renderHook(() => useDmUnreadCount())

    await waitFor(() => expect(result.current).toBe(5))
  })

  it('does not request unread counts without an active club', async () => {
    mockActiveClub = null

    const { result } = renderHook(() => useDmUnreadCount())

    expect(result.current).toBe(0)
    expect(mockApi).not.toHaveBeenCalled()
  })
})
