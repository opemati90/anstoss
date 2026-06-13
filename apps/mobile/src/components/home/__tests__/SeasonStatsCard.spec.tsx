import React from 'react'
import { render, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SeasonStatsCard } from '../SeasonStatsCard'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts === 'object' && typeof opts.defaultValue === 'string') {
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const v = (opts as Record<string, unknown>)[name]
        return v == null ? '' : String(v)
      })
    }
    return k
  }
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) }
})

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../../context/ClubThemeContext', () => {
  return {
    useClubColors: () => ({
      background: '#FAFAF8',
      surface: '#FFFFFF',
      borderDefault: '#E6E7F2',
      textPrimary: '#1A1C22',
      textSecondary: '#5F626C',
      textTertiary: '#767D8C',
      textInverse: '#FFFFFF',
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
      success: '#15803D',
      warning: '#B45309',
      error: '#9C4A67',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../../api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

const SAMPLE_STATS = {
  played: 10,
  wins: 6,
  draws: 2,
  losses: 2,
  winRate: 60.0,
  goalDifference: 8,
  recentForm: ['W', 'W', 'D', 'L', 'W'] as Array<'W' | 'D' | 'L'>,
}

describe('SeasonStatsCard', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('shows stats when data loads', async () => {
    mockApi.mockResolvedValueOnce(SAMPLE_STATS)

    const { findByText } = render(
      wrap(<SeasonStatsCard clubId="club-1" teamId="team-1" />),
    )

    // Section eyebrow
    expect(await findByText(/This Season/i)).toBeTruthy()
    // Played value
    expect(await findByText('10')).toBeTruthy()
    // Win Rate
    expect(await findByText('60%')).toBeTruthy()
    // Goal Diff positive
    expect(await findByText('+8')).toBeTruthy()
    // W/D/L counts — wins=6 is unique and confirms W cell renders
    expect(await findByText('6')).toBeTruthy()
  })

  it('hides when played === 0', async () => {
    mockApi.mockResolvedValueOnce({
      ...SAMPLE_STATS,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      goalDifference: 0,
      recentForm: [],
    })

    const { queryByText } = render(
      wrap(<SeasonStatsCard clubId="club-1" teamId="team-1" />),
    )

    // Wait for fetch to resolve
    await act(async () => {
      await Promise.resolve()
    })

    // Card should not render when played = 0
    expect(queryByText(/This Season/i)).toBeNull()
  })

  it('does not crash on loading state before data arrives', () => {
    // Never resolves — simulates pending fetch
    mockApi.mockReturnValueOnce(new Promise(() => {}))

    const { queryByText } = render(
      wrap(<SeasonStatsCard clubId="club-1" teamId="team-1" />),
    )

    // Nothing should render while loading
    expect(queryByText(/This Season/i)).toBeNull()
  })

  it('does not crash when API throws', async () => {
    mockApi.mockRejectedValueOnce(new Error('network error'))

    const { queryByText } = render(
      wrap(<SeasonStatsCard clubId="club-1" teamId="team-1" />),
    )

    await act(async () => {
      await Promise.resolve()
    })

    // Widget hidden on error
    expect(queryByText(/This Season/i)).toBeNull()
  })

  it('renders form dots with correct accessibility labels', async () => {
    mockApi.mockResolvedValueOnce(SAMPLE_STATS)

    const { findAllByLabelText } = render(
      wrap(<SeasonStatsCard clubId="club-1" teamId="team-1" />),
    )

    // recentForm = ['W', 'W', 'D', 'L', 'W'] — 3 W, 1 D, 1 L dots
    const wins = await findAllByLabelText('W')
    const draws = await findAllByLabelText('D')
    const losses = await findAllByLabelText('L')

    expect(wins).toHaveLength(3)
    expect(draws).toHaveLength(1)
    expect(losses).toHaveLength(1)
  })
})
