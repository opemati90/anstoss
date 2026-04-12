import renderer, { act } from 'react-test-renderer'
import { Text, Pressable } from 'react-native'
import JoinClubScreen from '../join-club'

const mockRouterBack = jest.fn()
const mockRouterReplace = jest.fn()

const authState = {
  user: null as null | { registrationRole: string },
}

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouterBack(),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
  },
  useLocalSearchParams: () => ({
    slug: 'sv-albatros',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'joinClub.title': 'Join club',
        'auth.loginModeTitle': 'Continue with email',
        'auth.loginModeBody': 'Please enter your registered email to continue.',
        'auth.login': 'Log in',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status?: number
  },
}))

jest.mock('../../src/components/ModalHeader', () => ({
  ModalHeader: ({ title }: { title?: string }) => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, title || 'Modal')
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function collectText(node: any): string {
  if (typeof node === 'string') return node
  if (!node?.children) return ''
  return node.children.map((child: any) => collectText(child)).join('')
}

function findButton(root: ReturnType<typeof renderer.create>, label: string) {
  const button = root.root.findAllByType(Pressable).find((node: any) =>
    node.findAllByType(Text).some((textNode: any) => collectText(textNode) === label),
  )

  if (!button) {
    throw new Error(`Button "${label}" not found`)
  }

  return button
}

describe('JoinClubScreen auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authState.user = null
  })

  it('routes signed-out users to auth while preserving the club slug', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<JoinClubScreen />)
    })

    act(() => {
      findButton(tree!, 'Log in').props.onPress()
    })

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(auth)/sign-in',
      params: { joinClubSlug: 'sv-albatros' },
    })
  })
})
