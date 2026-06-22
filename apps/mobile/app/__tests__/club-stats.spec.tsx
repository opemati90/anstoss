import React from 'react'
import renderer, { act } from 'react-test-renderer'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))

import ClubStatsScreen from '../club-stats'
import { FALLBACK_THEME } from '../../src/theme/club-theme'

const mockAuthState = {
  activeClub: {
    club: {
      id: 'club-1',
      name: 'FC QA',
    },
  },
}
const mockTheme = {
  ...FALLBACK_THEME,
  clubPrimary: '#1E3A5F',
  primary: '#1E3A5F',
}
const mockT = (key: string, options?: Record<string, unknown>) => {
  const count = typeof options?.count === 'number' ? options.count : undefined
  const map: Record<string, string> = {
    'clubStats.title': 'Vereinsstatistiken',
    'clubStats.overview': 'Vereinssummen',
    'clubStats.members': 'Mitglieder',
    'clubStats.teams': 'Mannschaften',
    'clubStats.upcomingEvents': 'Anstehende Events',
    'clubStats.rsvpRate': 'Rückmeldequote',
    'clubStats.perTeam': 'Aufschlüsselung nach Mannschaft',
  }

  if (key === 'clubStats.teamMembers') {
    return count === 1 ? '1 Mitglied' : `${count} Mitglieder`
  }

  if (key === 'clubStats.teamEvents') {
    return count === 1 ? '1 Termin' : `${count} Termine`
  }

  if (key === 'clubStats.teamRsvpRate') {
    return `${count}% Rückmeldequote`
  }

  return map[key] ?? key
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() =>
    Promise.resolve({
      memberCount: 1,
      teamCount: 1,
      upcomingEventCount: 0,
      overallRsvpRate: 0,
      teams: [
        {
          teamId: 'team-1',
          teamName: 'Herren III',
          teamDisplayName: 'HerrenIIIQADEV',
          memberCount: 1,
          upcomingEventCount: 0,
          rsvpRate: 0,
        },
      ],
    }),
  ),
}))

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node?.children) return []
  return node.children.flatMap((child: any) => collectText(child))
}

describe('ClubStatsScreen', () => {
  it('renders localized team breakdown labels instead of hardcoded English copy', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<ClubStatsScreen />)
    })

    const textContent = collectText(tree!.toJSON()).join(' ')

    // Section eyebrow renders uppercase ("VEREINSSUMMEN") per the editorial
    // header style; assert case-insensitively — the test verifies localization,
    // not the eyebrow's display casing.
    expect(textContent.toLowerCase()).toContain('vereinssummen')
    expect(textContent).toContain('1 Mitglied')
    expect(textContent).toContain('0 Termine')
    // Club totals now render as StatCards (value above label), so the RSVP
    // figure and its localized label appear as separate, value-first nodes.
    expect(textContent).toContain('Rückmeldequote')
    expect(textContent).toContain('0%')
    expect(textContent).not.toContain('1 members')
    expect(textContent).not.toContain('0 events')
    expect(textContent).not.toContain('0% RSVP')
  })
})
