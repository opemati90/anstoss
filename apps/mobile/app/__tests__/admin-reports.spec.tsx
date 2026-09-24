import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AdminReportsScreen from '../admin-reports'

const mockApi = jest.fn()
let mockRole = 'ADMIN'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}))
jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return { api: (...args: unknown[]) => mockApi(...args), ApiError }
})
const { ApiError: MockApiError } = jest.requireMock('../../src/api/client') as {
  ApiError: new (message: string, status: number) => Error
}
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { role: mockRole, club: { id: 'club-1', name: 'SV Albatros' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))
const mockViewer = jest.fn()
jest.mock('../../src/components/chat/MediaViewer', () => ({
  MediaViewer: (props: { media: unknown }) => {
    mockViewer(props.media)
    return null
  },
}))

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const OPEN = [
  {
    id: 'report-1',
    kind: 'channel',
    reason: 'ABUSE',
    createdAt: hoursAgo(30),
    resolvedAt: null,
    resolution: null,
    overdue: true,
    reporter: { id: 'u-lukas', name: 'Lukas Hoffmann' },
    message: {
      id: 'm-1',
      content: 'Wer heute nicht kommt, ist ein Versager.',
      removed: false,
      createdAt: hoursAgo(31),
      sender: { id: 'u-kevin', name: 'Kevin Richter' },
      teamId: 't-1',
      channelId: 'c-1',
    },
  },
]

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AdminReportsScreen />
    </SafeAreaProvider>,
  )
}

describe('Meldungen (admin reports)', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockRole = 'ADMIN'
  })

  it('lists open reports with the overdue marker and evidence text', async () => {
    mockApi.mockResolvedValue(OPEN)
    const screen = renderScreen()
    expect(screen.getByTestId('reports-loading')).toBeTruthy()
    expect(await screen.findByText('verein.reports.reason.ABUSE')).toBeTruthy()
    expect(screen.getAllByText('verein.reports.overdue').length).toBeGreaterThan(0)
    expect(screen.getByText(/Versager/)).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/moderation/reports?status=open&limit=100')
  })

  it('switches to resolved reports', async () => {
    mockApi.mockResolvedValue([])
    const screen = renderScreen()
    await screen.findByText('verein.reports.emptyOpenTitle')
    fireEvent.press(screen.getByTestId('reports-tab-resolved'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/moderation/reports?status=resolved&limit=100',
      ),
    )
  })

  it('removes a message only after a destructive confirmation', async () => {
    mockApi.mockImplementation((path: string) =>
      path.includes('/resolve') ? Promise.resolve({ id: 'report-1' }) : Promise.resolve(OPEN),
    )
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.()
    })
    const screen = renderScreen()
    fireEvent.press(await screen.findByTestId('report-row-report-1'))
    fireEvent.press(screen.getByText('verein.reports.remove'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/moderation/reports/report-1/resolve', {
        method: 'POST',
        body: { action: 'remove' },
      }),
    )
    expect(alertSpy).toHaveBeenCalledWith(
      'verein.reports.removeTitle',
      'verein.reports.removeBody',
      expect.any(Array),
    )
  })

  it('tells the admin an escalated report went to the platform team and drops it', async () => {
    mockApi.mockImplementation((path: string) =>
      path.includes('/resolve')
        ? Promise.reject(new MockApiError('own message', 403))
        : Promise.resolve(OPEN),
    )
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const screen = renderScreen()
    fireEvent.press(await screen.findByTestId('report-row-report-1'))
    fireEvent.press(screen.getByText('verein.reports.dismiss'))
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'verein.reports.ownMessageTitle',
        'verein.reports.escalatedBody',
      ),
    )
    // The queue is re-fetched so the escalated row disappears.
    await waitFor(() =>
      expect(mockApi.mock.calls.filter(([path]) => String(path).includes('status=open'))).toHaveLength(2),
    )
  })

  it('handles a 409 (already resolved elsewhere) with a translated note and reload', async () => {
    mockApi.mockImplementation((path: string) =>
      path.includes('/resolve')
        ? Promise.reject(new MockApiError('Report has already been resolved', 409))
        : Promise.resolve(OPEN),
    )
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const screen = renderScreen()
    fireEvent.press(await screen.findByTestId('report-row-report-1'))
    fireEvent.press(screen.getByText('verein.reports.dismiss'))
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'verein.reports.ownMessageTitle',
        'verein.reports.alreadyResolved',
      ),
    )
    expect(alertSpy).not.toHaveBeenCalledWith(expect.anything(), 'Report has already been resolved')
  })

  it('says that child-safety and staff reports go to the platform team', async () => {
    mockApi.mockResolvedValue(OPEN)
    const screen = renderScreen()
    expect(await screen.findByText(/verein\.reports\.platformNote/)).toBeTruthy()
  })

  it('shows image evidence and opens it full-screen', async () => {
    mockViewer.mockReset()
    const withImage = [
      {
        ...OPEN[0],
        message: {
          ...OPEN[0].message,
          attachment: { url: 'https://r2.example/signed.jpg?sig=1', meta: { width: 800, height: 600, mimeType: 'image/jpeg' } },
        },
      },
    ]
    mockApi.mockResolvedValue(withImage)
    const screen = renderScreen()
    fireEvent.press(await screen.findByTestId('report-row-report-1'))
    fireEvent.press(screen.getByLabelText('verein.reports.evidenceImageA11y'))
    expect(mockViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'image', url: 'https://r2.example/signed.jpg?sig=1' }),
    )
  })

  it('offers a reload when the signed evidence URL has expired', async () => {
    const withImage = [
      {
        ...OPEN[0],
        message: { ...OPEN[0].message, attachment: { url: 'https://r2.example/old.jpg', meta: null } },
      },
    ]
    mockApi.mockResolvedValue(withImage)
    const screen = renderScreen()
    fireEvent.press(await screen.findByTestId('report-row-report-1'))
    const image = screen.getByTestId('report-evidence-image')
    fireEvent(image.findByType(require('react-native').Image), 'error')
    fireEvent.press(await screen.findByText('verein.reports.evidenceReload'))
    await waitFor(() =>
      expect(mockApi.mock.calls.filter(([path]) => String(path).includes('status=open'))).toHaveLength(2),
    )
  })

  it('shows an inline error with retry', async () => {
    mockApi.mockRejectedValue(new Error('offline'))
    const screen = renderScreen()
    expect(await screen.findByText('verein.reports.loadError')).toBeTruthy()
  })

  it('keeps non-admins out', () => {
    mockRole = 'PLAYER'
    const screen = renderScreen()
    expect(screen.getByText('common.accessDenied')).toBeTruthy()
  })
})
