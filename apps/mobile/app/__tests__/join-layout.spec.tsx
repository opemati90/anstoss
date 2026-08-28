import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'
import { Alert } from 'react-native'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

import JoinInviteScreen from '../join/[...code]'

const mockReplace = jest.fn()
const mockRefreshUser = jest.fn()
const mockSignOut = jest.fn()
let mockSignedIn = false
const mockApi = jest.fn()
const mockT = (key: string) => {
  const map: Record<string, string> = {
    'join.invalidBody': 'Ungueltig',
    'join.eyebrow': 'Einladung',
    'join.inviteTypeLabel': 'Einladungstyp',
    'join.teamLabel': 'Mannschaft',
    'join.groupLabel': 'Gruppe',
    'join.roleLabel': 'Rolle',
    'join.phaseLabel': 'Phase',
    'join.expiresLabel': 'Gueltig bis',
    'join.childLabel': 'Kind',
    'join.guardianLabel': 'Erziehungsberechtigte E-Mail-Adresse',
    'join.kind.CLUB': 'Verein',
    'join.status.PENDING': 'Ausstehend',
    'invite.phaseFull': 'Vollmitgliedschaft',
    'teamRoles.PARENT': 'Elternteil',
    'join.signInTitle': 'Anmelden',
    'join.signInBody': 'Bitte anmelden',
    'join.signInCta': 'Weiter',
    'join.redeemCta': 'Join',
    'join.pendingClubTitle': 'Request sent to the club',
    'join.pendingClubBody': 'A club administrator will review your request.',
  }

  return map[key] ?? key
}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    code: 'qa-code',
  }),
  useRouter: () => ({
    replace: (...args: any[]) => mockReplace(...args),
  }),
  router: { back: jest.fn() },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isSignedIn: mockSignedIn,
    isLoading: false,
    ageGate: {
      isUnder16: false,
    },
    refreshUser: mockRefreshUser,
    signOut: mockSignOut,
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

const invitePayload = {
      kind: 'CLUB',
      status: 'PENDING',
      role: 'PARENT',
      phase: 'FULL',
      expiresAt: '2026-04-15T12:00:00.000Z',
      club: {
        name: 'FC QA',
        badgeUrl: null,
        primaryColor: '#1E3A5F',
      },
      team: {
        displayName: 'U15 Leistungskader mit langem Namen',
        group: {
          displayName: 'Aufbaubereich Leistungszentrum',
        },
      },
    }

function collectText(node: any): string {
  if (typeof node === 'string') return node
  if (!node?.children) return ''
  return node.children.map((child: any) => collectText(child)).join('')
}

function flattenStyle(style: any) {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style
}

describe('JoinInviteScreen layout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSignedIn = false
    mockRefreshUser.mockResolvedValue(undefined)
    mockApi.mockResolvedValue(invitePayload)
  })
  it('keeps long invite details in a wrapped two-column grid', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<JoinInviteScreen />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    const textNodes = tree!.root.findAllByType(Text)
    const redactedGuardianEmail = textNodes.find((node: any) =>
      collectText(node).includes('erziehungsberechtigte-familie@example.com'),
    )
    const redactedChildName = textNodes.find((node: any) =>
      collectText(node).includes('Maximilian Beispielspieler'),
    )
    const detailGrid = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.flexWrap === 'wrap' && style?.justifyContent === 'space-between' && style?.gap === 16
    })
    const detailBlock = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.width === '48%' && style?.gap === 4
    })

    expect(redactedGuardianEmail).toBeUndefined()
    expect(redactedChildName).toBeUndefined()
    expect(detailGrid).toBeTruthy()
    expect(detailBlock).toBeTruthy()
  })

  it('routes approval-required campaign redemption to pending approval without claiming access', async () => {
    mockSignedIn = true
    mockApi
      .mockResolvedValueOnce({ ...invitePayload, role: 'PLAYER' })
      .mockResolvedValueOnce({ status: 'PENDING', clubId: 'club-1', teamId: 'team-1' })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    let tree: ReturnType<typeof renderer.create>
    try {
      await act(async () => {
        tree = renderer.create(<JoinInviteScreen />)
      })
      await act(async () => {
        await Promise.resolve()
      })
      const joinButton = tree!.root.findAll((node: any) =>
        node.props?.accessibilityRole === 'button'
      ).find((node: any) => collectText(node).includes('Join'))
      expect(joinButton).toBeTruthy()
      await act(async () => {
        joinButton?.props.onPress()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(alert).toHaveBeenCalledWith(
        'Request sent to the club',
        'A club administrator will review your request.',
      )
      expect(mockReplace).toHaveBeenCalledWith('/pending-approval')
      expect(mockReplace).not.toHaveBeenCalledWith('/')
    } finally {
      alert.mockRestore()
    }
  })
})
