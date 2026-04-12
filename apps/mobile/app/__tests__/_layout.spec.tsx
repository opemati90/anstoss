import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

const mockHideAsync = jest.fn(() => Promise.resolve())
const mockPreventAutoHideAsync = jest.fn(() => Promise.resolve())
const mockRouterPush = jest.fn()
const mockUsePushContext = jest.fn<any, any>(() => ({ lastNotification: null }))
const mockUseUpdateCheck = jest.fn(() => ({
  forceUpdate: false,
  openStore: jest.fn(),
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

const mockClerkProvider = jest.fn(
  ({
    publishableKey,
    children,
  }: {
    publishableKey: string
    children?: React.ReactNode
  }) => (
    <View>
      <Text testID="clerk-publishable-key">{publishableKey}</Text>
      {children}
    </View>
  ),
)

jest.mock('@clerk/clerk-expo', () => ({
  ClerkProvider: (props: any) => mockClerkProvider(props),
  ClerkLoaded: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

jest.mock('../../src/auth/token-cache', () => ({
  tokenCache: {},
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
  const originalClerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
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
    devGlobal.__DEV__ = true
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_test_cHJlY2lvdXMtaGF3ay00OC5jbGVyay5hY2NvdW50cy5kZXYk'
    process.env.EXPO_PUBLIC_API_URL = 'https://anstoss-api-production.up.railway.app'
    process.env.EXPO_PUBLIC_APP_STAGE = 'development'
  })

  afterAll(() => {
    devGlobal.__DEV__ = originalDev
    if (originalClerkKey === undefined) {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    } else {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalClerkKey
    }
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

  it('shows a configuration screen instead of crashing when the Clerk key is missing', async () => {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    process.env.EXPO_PUBLIC_API_URL = 'https://anstoss-api-production.up.railway.app'

    let tree: ReturnType<typeof renderer.create>
    await act(async () => {
      tree = renderer.create(<RootLayout />)
    })

    const textContent = tree!.root.findAllByType(Text).map(collectText)

    expect(textContent).toContain('Build configuration incomplete')
    expect(textContent).toContain(
      'This build cannot start safely until the runtime configuration is fixed.',
    )
    expect(textContent.join('\n')).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')
    expect(mockClerkProvider).not.toHaveBeenCalled()
  })

  it('routes event notifications to event detail with eventId', async () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_test_cHJlY2lvdXMtaGF3ay00OC5jbGVyay5hY2NvdW50cy5kZXYk'
    process.env.EXPO_PUBLIC_API_URL = 'https://anstoss-api-production.up.railway.app'
    process.env.EXPO_PUBLIC_APP_STAGE = 'development'
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
      renderer.create(<PushDeepLinkHandler />)
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'event-42' },
    })
  })

  it('routes dm notifications to the direct-message thread', async () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_test_cHJlY2lvdXMtaGF3ay00OC5jbGVyay5hY2NvdW50cy5kZXYk'
    process.env.EXPO_PUBLIC_API_URL = 'https://anstoss-api-production.up.railway.app'
    process.env.EXPO_PUBLIC_APP_STAGE = 'development'
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
      renderer.create(<PushDeepLinkHandler />)
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/dm-chat',
      params: { conversationId: 'conversation-7' },
    })
  })

  it('blocks a release build when the Clerk key points to a development instance', async () => {
    devGlobal.__DEV__ = false
    const { evaluateRuntimeConfigIssues } = require('../../src/config/runtime')
    const issues = evaluateRuntimeConfigIssues(
      {
        apiUrl: 'https://anstoss-api-production.up.railway.app',
        clerkPublishableKey:
          'pk_test_cHJlY2lvdXMtaGF3ay00OC5jbGVyay5hY2NvdW50cy5kZXYk',
        appStage: 'production',
      },
      { releaseBuild: true },
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
          reason: expect.stringContaining('test or development instance'),
        }),
      ]),
    )
  })

  it('allows a TestFlight release build to use the internal Clerk test key', async () => {
    devGlobal.__DEV__ = false
    const { evaluateRuntimeConfigIssues } = require('../../src/config/runtime')
    const issues = evaluateRuntimeConfigIssues(
      {
        apiUrl: 'https://anstoss-api-production.up.railway.app',
        clerkPublishableKey:
          'pk_test_cHJlY2lvdXMtaGF3ay00OC5jbGVyay5hY2NvdW50cy5kZXYk',
        appStage: 'testflight',
      },
      { releaseBuild: true },
    )

    expect(issues).toEqual([])
  })
})
