import React from 'react'
import renderer, { act } from 'react-test-renderer'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}))

import MotmArchiveScreen from '../motm-archive'
import { FALLBACK_THEME } from '../../src/theme/club-theme'

const mockAuthState = {
  activeClub: { club: { id: 'club-1', name: 'FC QA' } },
}
const mockTheme = {
  ...FALLBACK_THEME,
  primary: '#1E3A5F',
}

const mockT = (key: string, options?: Record<string, unknown>) => {
  if (typeof options?.defaultValue === 'string') {
    let value = options.defaultValue as string
    for (const [k, v] of Object.entries(options)) {
      if (k === 'defaultValue') continue
      value = value.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
    }
    return value
  }
  return key
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: { language: 'en-GB' } }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))


const { api: apiMock } = require('../../src/api/client') as {
  api: jest.Mock
}

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node?.children) return []
  return node.children.flatMap((child: any) => collectText(child))
}

describe('MotmArchiveScreen', () => {
  beforeEach(() => {
    apiMock.mockReset()
  })

  it('renders both sections when archive has data', async () => {
    apiMock.mockResolvedValue({
      season: '2025-26',
      topByPlayer: [
        { userId: 'u1', name: 'Alex Striker', avatarUrl: null, count: 3 },
        { userId: 'u2', name: 'Sam Defender', avatarUrl: null, count: 1 },
      ],
      byMatch: [
        {
          matchId: 'f1',
          kickoffAt: '2025-09-14T13:00:00Z',
          opponentName: 'Hertha 03',
          motmUserId: 'u1',
          motmName: 'Alex Striker',
        },
      ],
    })

    let tree: ReturnType<typeof renderer.create>
    await act(async () => {
      tree = renderer.create(<MotmArchiveScreen />)
    })
    // Flush the resolved promise + state update.
    await act(async () => {})

    const text = collectText(tree!.toJSON()).join(' ')

    expect(text).toContain('Top players this season')
    expect(text).toContain('Match by match')
    expect(text).toContain('Alex Striker')
    expect(text).toContain('Hertha 03')
    expect(text).toContain('SEASON 2025-26')
    expect(apiMock).toHaveBeenCalledWith('/clubs/club-1/motm/archive')
  })

  it('shows the empty state when archive has no data', async () => {
    apiMock.mockResolvedValue({
      season: '2025-26',
      topByPlayer: [],
      byMatch: [],
    })

    let tree: ReturnType<typeof renderer.create>
    await act(async () => {
      tree = renderer.create(<MotmArchiveScreen />)
    })
    await act(async () => {})

    const text = collectText(tree!.toJSON()).join(' ')
    expect(text).toContain('No MOTM picks yet this season.')
    expect(text).not.toContain('Top players this season')
  })
})
