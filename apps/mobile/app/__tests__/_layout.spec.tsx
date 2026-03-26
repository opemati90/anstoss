import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

const mockHideAsync = jest.fn(() => Promise.resolve())
const mockPreventAutoHideAsync = jest.fn(() => Promise.resolve())
const mockUseUpdateCheck = jest.fn(() => ({
  forceUpdate: false,
  openStore: jest.fn(),
}))

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: mockPreventAutoHideAsync,
  hideAsync: mockHideAsync,
}))

jest.mock('expo-router', () => {
  const React = require('react')
  const { View } = require('react-native')

  const Stack = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  Stack.Screen = () => null

  return { Stack }
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
}))

jest.mock('../../src/components/PushNotificationProvider', () => ({
  PushNotificationProvider: () => null,
}))

jest.mock('../../src/components/ForceUpdateScreen', () => ({
  ForceUpdateScreen: () => {
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

jest.mock('../../src/i18n', () => ({}))

function collectText(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : collectText(child)))
    .join('')
}

describe('RootLayout', () => {
  let RootLayout: typeof import('../_layout').default
  const originalClerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL

  beforeAll(() => {
    RootLayout = require('../_layout').default
  })

  beforeEach(() => {
    jest.clearAllMocks()
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
      'This build is missing the configuration required to start Anstoss.',
    )
    expect(textContent.join('\n')).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')
    expect(mockClerkProvider).not.toHaveBeenCalled()
  })
})
