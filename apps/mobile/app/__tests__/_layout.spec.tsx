import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'

const mockHideAsync = jest.fn(() => Promise.resolve())
const mockPreventAutoHideAsync = jest.fn(() => Promise.resolve())
const mockRouterPush = jest.fn()
const mockUsePushContext = jest.fn<any, any>(() => ({ lastNotification: null }))
const mockUseUpdateCheck = jest.fn(() => ({
  forceUpdate: false,
  softUpdate: false,
  openStore: jest.fn(),
  dismissSoftUpdate: jest.fn(),
  dismissAnnouncement: jest.fn(),
}))

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: mockPreventAutoHideAsync,
  hideAsync: mockHideAsync,
}))

jest.mock('expo-router', () => {
  // eslint-disable-next-line no-useless-assignment
  const React = require('react')
  const { View } = require('react-native')

  const Stack = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  Stack.Screen = () => null

  return {
    Stack,
    router: {
      push: (...args: unknown[]) => mockRouterPush(...args),
    },
  }
})

jest.mock('@expo-google-fonts/dm-sans', () => ({
  useFonts: jest.fn(() => [true]),
  DMSans_400Regular: {},
  DMSans_500Medium: {},
  DMSans_600SemiBold: {},
  DMSans_700Bold: {},
}))

jest.mock('@expo-google-fonts/geist-mono', () => ({
  GeistMono_400Regular: {},
}))

jest.mock('../../src/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  ClubThemeProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useIsDark: () => false,
}))

jest.mock('../../src/components/PushNotificationProvider', () => ({
  PushNotificationProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  usePushContext: () => mockUsePushContext(),
}))

jest.mock('../../src/components/ForceUpdateScreen', () => ({
  ForceUpdateScreen: () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const React = require('react')
    const { Text } = require('react-native')
    return <Text>Force update</Text>
  },
}))

jest.mock('../../src/components/ReleaseNotices', () => ({
  ReleaseNotices: () => null,
}))

jest.mock('../../src/hooks/useUpdateCheck', () => ({
  useUpdateCheck: () => mockUseUpdateCheck(),
}))

jest.mock('../../src/utils/sentry', () => ({
  initSentry: jest.fn(),
}))

jest.mock('../../src/i18n', () => ({
  initializeI18n: jest.fn(() => Promise.resolve()),
}))

function collectText(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : collectText(child)))
    .join('')
}

const devGlobal = global as typeof globalThis & { __DEV__?: boolean }

describe('RootLayout', () => {
  let RootLayout: typeof import('../_layout').default
  let PushDeepLinkHandler: typeof import('../_layout').PushDeepLinkHandler
  let mountedTree: ReturnType<typeof renderer.create> | null = null
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL
  const originalAppStage = process.env.EXPO_PUBLIC_APP_STAGE
  const originalDev = devGlobal.__DEV__

  beforeAll(() => {
    const layoutModule = require('../_layout')
    RootLayout = layoutModule.default
    PushDeepLinkHandler = layoutModule.PushDeepLinkHandler
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mountedTree = null
    devGlobal.__DEV__ = true
    process.env.EXPO_PUBLIC_API_URL = 'https://anstoss-api-production.up.railway.app'
    process.env.EXPO_PUBLIC_APP_STAGE = 'development'
  })

  afterEach(() => {
    if (!mountedTree) return
    act(() => {
      mountedTree?.unmount()
      mountedTree = null
    })
  })

  afterAll(() => {
    devGlobal.__DEV__ = originalDev
    if (originalApiUrl === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL
    } else {
      process.env.EXPO_PUBLIC_API_URL = originalApiUrl
    }
    if (originalAppStage === undefined) {
      delete process.env.EXPO_PUBLIC_APP_STAGE
    } else {
      process.env.EXPO_PUBLIC_APP_STAGE = originalAppStage
    }
  })

  it('shows a configuration screen instead of crashing when the API URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_API_URL

    await act(async () => {
      mountedTree = renderer.create(<RootLayout />)
    })

    const textContent = mountedTree!.root.findAllByType(Text).map(collectText)

    expect(textContent).toContain('Build configuration incomplete')
    expect(textContent).toContain(
      'This build cannot start safely until the runtime configuration is fixed.',
    )
    expect(textContent.join('\n')).toContain('EXPO_PUBLIC_API_URL')
  })

  it('routes event notifications to event detail with eventId', async () => {
    mockUsePushContext.mockReturnValue({
      lastNotification: {
        notification: {
          request: {
            content: {
              data: { type: 'event', eventId: 'event-42' },
            },
          },
        },
      },
    })

    await act(async () => {
      mountedTree = renderer.create(<PushDeepLinkHandler />)
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'event-42' },
    })
  })

  it('routes dm notifications to the direct-message thread', async () => {
    mockUsePushContext.mockReturnValue({
      lastNotification: {
        notification: {
          request: {
            content: {
              data: { type: 'dm', conversationId: 'conversation-7' },
            },
          },
        },
      },
    })

    await act(async () => {
      mountedTree = renderer.create(<PushDeepLinkHandler />)
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/dm-chat',
      params: { conversationId: 'conversation-7' },
    })
  })

  it('reports no config issues when the API URL is set', async () => {
    const { evaluateRuntimeConfigIssues } = require('../../src/config/runtime')
    const issues = evaluateRuntimeConfigIssues({
      apiUrl: 'https://anstoss-api-production.up.railway.app',
      appStage: 'production',
    })

    expect(issues).toEqual([])
  })
})
