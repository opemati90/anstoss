import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import StudioBrandKitScreen from '../studio/brand-kit'

jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => require('../../src/theme/club-theme').FALLBACK_THEME,
  useIsDark: () => false,
}))
jest.mock('../../src/utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 24, bottom: 12, left: 0, right: 0 }),
}))
const mockApi = api as jest.Mock
const mockAuth = useAuth as jest.Mock
const kit = {
  clubId: 'club',
  crestUrl: null,
  sponsors: [{ id: 'sponsor', name: 'Bäckerei Krause', logoUrl: null }],
  fontPairing: 'CONDENSED',
  handle: null,
  hashtags: [],
  accounts: [],
  templateSetAt: null,
  colors: { primary: '#123456', accent: '#D4F25C', dark: '#121A15', light: '#F1EEE4' },
}
const auth = (role = 'OWNER', offices: string[] = []) => ({
  user: { id: 'user' },
  token: 'test',
  activeClub: { role, operationalRoles: offices, club: { id: 'club', name: 'SV Test' } },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue(auth())
  mockApi.mockReset().mockResolvedValue(kit)
})

it('renders confirmed settings and preserves sponsor name order without unsupported services', async () => {
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() =>
    expect(view.getByTestId('studio-kit-font-condensed').props.accessibilityState).toMatchObject({
      checked: true,
    }),
  )
  expect(view.getByText('Bäckerei Krause')).toBeTruthy()
  expect(view.getByText('#123456')).toBeTruthy()
  expect(view.getByTestId('studio-kit-add-logo')).toBeTruthy()
  expect(view.queryByTestId('studio-kit-generate')).toBeNull()
  expect(view.queryByTestId('studio-kit-connect-instagram')).toBeNull()
  expect(mockApi).toHaveBeenCalledTimes(1)
})

it('selects a font only after confirmation and exposes saving state', async () => {
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() => expect(view.getByTestId('studio-kit-font-modern')).toBeTruthy())
  let resolve!: (value: unknown) => void
  mockApi.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  fireEvent.press(view.getByTestId('studio-kit-font-modern'))
  expect(view.getByText('studio.brandKit.saving')).toBeTruthy()
  expect(view.getByTestId('studio-kit-font-condensed').props.accessibilityState).toMatchObject({
    checked: true,
  })
  expect(view.getByTestId('studio-kit-font-modern').props.accessibilityState).toMatchObject({
    checked: false,
    disabled: true,
  })
  await act(async () => resolve({ ...kit, fontPairing: 'MODERN' }))
  expect(view.getByTestId('studio-kit-font-modern').props.accessibilityState).toMatchObject({
    checked: true,
  })
  expect(mockApi).toHaveBeenLastCalledWith('/clubs/club/studio/brand-kit', {
    method: 'PUT',
    body: { fontPairing: 'MODERN' },
  })
})

it('shows save failure, reloads the persisted kit and does not silently keep a local change', async () => {
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() => expect(view.getByTestId('studio-kit-font-modern')).toBeTruthy())
  mockApi.mockRejectedValueOnce(new Error('Offline'))
  fireEvent.press(view.getByTestId('studio-kit-font-modern'))
  await waitFor(() => expect(view.getByText('studio.brandKit.saveFailed')).toBeTruthy())
  expect(view.queryByTestId('studio-kit-font-modern')).toBeNull()
  fireEvent.press(view.getByText('common.retry'))
  await waitFor(() =>
    expect(view.getByTestId('studio-kit-font-condensed').props.accessibilityState).toMatchObject({
      checked: true,
    }),
  )
})

it('shows a retryable loading error instead of fabricated defaults', async () => {
  mockApi.mockRejectedValueOnce(new Error('No plan'))
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() => expect(view.getByText('studio.brandKit.loadFailed')).toBeTruthy())
  expect(view.queryByTestId('studio-kit-font-condensed')).toBeNull()
})

it('uses a skeleton while loading without a selectable default font', () => {
  mockApi.mockImplementation(() => new Promise(() => {}))
  const view = render(<StudioBrandKitScreen />)
  expect(view.getByTestId('studio-kit-loading')).toBeTruthy()
  expect(view.queryByTestId('studio-kit-font-condensed')).toBeNull()
})

it('keeps a captain read-only and hides links to admin-only asset management', async () => {
  mockAuth.mockReturnValue(auth('PLAYER', ['CAPTAIN']))
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() => expect(view.getByTestId('studio-kit-font-modern')).toBeTruthy())
  expect(view.getByTestId('studio-kit-font-modern').props.accessibilityState).toMatchObject({
    disabled: true,
  })
  expect(view.getByText('studio.brandKit.readOnly')).toBeTruthy()
  expect(view.queryByTestId('studio-kit-add-logo')).toBeNull()
  expect(view.queryByTestId('studio-kit-change-colors')).toBeNull()
  fireEvent.press(view.getByTestId('studio-kit-font-modern'))
  expect(mockApi).toHaveBeenCalledTimes(1)
})

it('denies a coach without an explicit Studio office without making requests', () => {
  mockAuth.mockReturnValue(auth('COACH'))
  const view = render(<StudioBrandKitScreen />)
  expect(view.getByText('studio.brandKit.noAccessTitle')).toBeTruthy()
  expect(mockApi).not.toHaveBeenCalled()
})

it('reverts to the access state when role is revoked while mounted', async () => {
  const view = render(<StudioBrandKitScreen />)
  await waitFor(() => expect(view.getByTestId('studio-kit-font-modern')).toBeTruthy())
  mockAuth.mockReturnValue(auth('PLAYER'))
  view.rerender(<StudioBrandKitScreen />)
  expect(view.queryByText('Bäckerei Krause')).toBeNull()
  expect(view.getByText('studio.brandKit.noAccessTitle')).toBeTruthy()
})
