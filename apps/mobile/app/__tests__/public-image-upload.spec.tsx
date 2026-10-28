import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import EditProfileScreen from '../edit-profile'
import AdminClubProfileScreen from '../admin-club-profile'
import AdminSponsorsScreen from '../admin-sponsors'

const mockApi = jest.fn()
const mockRefresh = jest.fn()
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user', name: 'Player', email: 'player@example.test' },
    refreshUser: mockRefresh,
    activeClub: { role: 'ADMIN', club: { id: 'club', name: 'Test Club', primaryColor: '#123456' } },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../src/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ has: () => true }),
}))
jest.mock('../../src/components/billing/PaywallSheet', () => ({ PaywallSheet: () => null }))
jest.mock('../../src/utils/mediaPermissions', () => ({ ensurePickerMediaAccess: async () => true }))
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked.png' }],
  }),
}))
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { PNG: 'png' },
  manipulateAsync: async () => ({ uri: 'file:///resized.png' }),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn() },
}))

function screenFor(Component: React.ComponentType) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <Component />
    </SafeAreaProvider>,
  )
}

describe('image upload screen persistence', () => {
  const originalFetch = global.fetch
  const reservation = {
    enabled: true,
    uploadUrl: 'https://storage.example/put',
    publicUrl: 'https://assets.example/image.png',
  }
  let alert: jest.SpyInstance
  beforeEach(() => {
    jest.clearAllMocks()
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    mockApi.mockImplementation(async (path: string) =>
      path.endsWith('/presign') ? reservation : [],
    )
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: string) =>
        url.startsWith('file:') ? { blob: async () => ({ size: 12 }) } : { ok: false, status: 403 },
      )
  })
  afterEach(() => {
    global.fetch = originalFetch
    alert.mockRestore()
  })

  it('keeps the existing avatar and does not patch the user after failed PUT', async () => {
    const screen = screenFor(EditProfileScreen)
    fireEvent.press(screen.getByRole('button', { name: 'editProfile.changePhoto' }))
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('common.error', 'editProfile.uploadFailed'),
    )
    expect(mockApi).not.toHaveBeenCalledWith('/me', expect.objectContaining({ method: 'PATCH' }))
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('persists the avatar after successful PUT', async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (url: string) =>
      url.startsWith('file:') ? { blob: async () => ({ size: 12 }) } : { ok: true },
    )
    const screen = screenFor(EditProfileScreen)
    fireEvent.press(screen.getByRole('button', { name: 'editProfile.changePhoto' }))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/me', {
        method: 'PATCH',
        body: { avatarUrl: reservation.publicUrl },
      }),
    )
    expect(alert).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'keeps club edits open when the upload fails (disabled=%s)',
    async (disabled) => {
      if (disabled) mockApi.mockResolvedValue({ enabled: false, uploadUrl: null, publicUrl: null })
      const screen = screenFor(AdminClubProfileScreen)
      fireEvent.press(screen.getAllByRole('button', { name: 'verein.profile.changeCrest' })[0])
      await waitFor(() => expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled())
      fireEvent.press(screen.getByRole('button', { name: 'common.save' }))
      await waitFor(() => expect(alert).toHaveBeenCalled())
      expect(mockApi).not.toHaveBeenCalledWith(
        '/clubs/club',
        expect.objectContaining({ method: 'PATCH' }),
      )
      expect(router.back).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    'never creates a sponsor with a failed/local image (disabled=%s)',
    async (disabled) => {
      if (disabled)
        mockApi.mockImplementation(async (path: string) =>
          path.endsWith('/presign') ? { enabled: false, uploadUrl: null, publicUrl: null } : [],
        )
      const screen = screenFor(AdminSponsorsScreen)
      fireEvent.press(await screen.findByRole('button', { name: 'sponsors.add' }))
      fireEvent.changeText(screen.getByPlaceholderText('sponsors.namePlaceholder'), 'Sponsor')
      fireEvent.press(screen.getByRole('button', { name: 'sponsors.uploadLogo' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'sponsors.uploadLogo' })).toBeEnabled(),
      )
      fireEvent.press(screen.getByRole('button', { name: 'common.save' }))
      await waitFor(() =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club/assets/presign', expect.anything()),
      )
      await waitFor(() => expect(alert).toHaveBeenCalled())
      expect(mockApi).not.toHaveBeenCalledWith(
        '/clubs/club/sponsors',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(screen.getByPlaceholderText('sponsors.namePlaceholder').props.value).toBe('Sponsor')
    },
  )
})
