import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import InviteScreen from '../invite'
import { api } from '../../src/api/client'

const mockQrCode = jest.fn((_props: Record<string, unknown>) => null)
const mockParams: { mode?: string; returnTo?: string } = {}
jest.mock('react-native-qrcode-svg', () => (props: Record<string, unknown>) => mockQrCode(props))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { dismissTo: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = String(options?.defaultValue ?? key)
      return Object.entries(options ?? {}).reduce(
        (copy, [name, replacement]) => copy.replaceAll(`{{${name}}}`, String(replacement)),
        value,
      )
    },
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: {
      role: 'OWNER',
      club: { id: 'club-1', slug: 'fc-qa', name: 'FC QA' },
    },
    activeTeamId: 'team-1',
    isLoading: false,
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => FALLBACK_THEME,
    useIsDark: () => false,
  }
})
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))

const mockApi = api as jest.MockedFunction<typeof api>

describe('InviteScreen QR campaigns', () => {
  beforeEach(() => {
    delete mockParams.mode
    delete mockParams.returnTo
    mockApi.mockReset()
    mockApi.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.endsWith('/team-groups')) {
        return Promise.resolve([
          {
            id: 'group-1',
            displayName: 'Senior',
            teams: [
              {
                id: 'team-1',
                displayName: 'First team',
                squadLabel: null,
                leagueName: null,
              },
            ],
          },
        ]) as ReturnType<typeof api>
      }
      if (path.endsWith('/members')) return Promise.resolve([]) as ReturnType<typeof api>
      if (path.includes('/team-links')) return Promise.resolve([]) as ReturnType<typeof api>
      if (path.endsWith('/invite-campaigns') && options?.method === 'POST') {
        return Promise.resolve({
          id: 'campaign-1',
          code: 'A1B2C3D4',
          status: 'ACTIVE',
          useCount: 0,
          maxUses: 50,
          expiresAt: '2026-09-10T12:00:00.000Z',
          team: { id: 'team-1', displayName: 'First team' },
        }) as ReturnType<typeof api>
      }
      if (path.endsWith('/invite-campaigns')) return Promise.resolve([]) as ReturnType<typeof api>
      if (path.endsWith('/invites') && options?.method === 'POST') {
        return Promise.resolve({
          code: 'COACH123',
          link: 'https://anstoss.io/join/fc-qa/COACH123',
        }) as ReturnType<typeof api>
      }
      return Promise.resolve(null) as ReturnType<typeof api>
    })
  })

  it('creates an approval-required QR campaign without requiring email addresses', async () => {
    const screen = render(<InviteScreen />)

    fireEvent.press(await screen.findByLabelText('Next'))
    fireEvent.press(await screen.findByLabelText('Create QR without emails'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/invite-campaigns', {
        method: 'POST',
        body: {
          teamId: 'team-1',
          type: 'APPROVAL_REQUIRED',
          role: 'PLAYER',
          maxUses: 50,
          expiresInDays: 14,
        },
      })
    })

    expect(await screen.findByLabelText('Join-request QR code for First team')).toBeTruthy()
    expect(screen.getByText('A1B2C3D4')).toBeTruthy()
    expect(mockQrCode).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'https://anstoss.io/join/fc-qa/A1B2C3D4',
        size: 196,
        quietZone: 12,
        color: '#000000',
        backgroundColor: '#FFFFFF',
      }),
    )
  })

  it('sends a team-scoped coach invite and never creates a public staff campaign', async () => {
    mockParams.mode = 'coach'
    const screen = render(<InviteScreen />)

    fireEvent.press(await screen.findByLabelText('Head coach'))
    fireEvent.press(screen.getByLabelText('Next'))
    fireEvent.changeText(screen.getByTestId('invite-recipient-input'), 'coach@example.com')
    fireEvent.press(screen.getByLabelText('Next'))
    fireEvent.press(screen.getByLabelText('invite.sendEmail'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/invites', {
        method: 'POST',
        body: {
          teamId: 'team-1',
          role: 'HEAD_COACH',
          phase: 'FULL',
          deliveryChannel: 'EMAIL',
          recipientEmail: 'coach@example.com',
          linkedPlayerUserId: undefined,
          childName: undefined,
        },
      })
    })
    expect(
      mockApi.mock.calls.some(
        ([path, options]) =>
          path === '/clubs/club-1/invite-campaigns' && options?.method === 'POST',
      ),
    ).toBe(false)
  })
})
