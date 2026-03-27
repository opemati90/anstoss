import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

import JoinInviteScreen from '../join/[code]'

const mockReplace = jest.fn()
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
    isSignedIn: false,
    isLoading: false,
    ageGate: {
      isUnder16: false,
    },
    refreshUser: jest.fn(),
    signOut: jest.fn(),
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() =>
    Promise.resolve({
      kind: 'CLUB',
      status: 'PENDING',
      role: 'PARENT',
      phase: 'FULL',
      expiresAt: '2026-04-15T12:00:00.000Z',
      recipientEmail: 'family@example.com',
      guardianEmail: 'erziehungsberechtigte-familie@example.com',
      childName: 'Maximilian Beispielspieler',
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
    }),
  ),
}))

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
  it('keeps long invite details in a wrapped two-column grid', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<JoinInviteScreen />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    const textNodes = tree!.root.findAllByType(Text)
    const guardianEmail = textNodes.find((node: any) =>
      collectText(node).includes('erziehungsberechtigte-familie@example.com'),
    )
    const detailGrid = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.flexWrap === 'wrap' && style?.justifyContent === 'space-between' && style?.gap === 14
    })
    const detailBlock = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.width === '48%' && style?.gap === 4
    })

    expect(guardianEmail).toBeTruthy()
    expect(detailGrid).toBeTruthy()
    expect(detailBlock).toBeTruthy()
  })
})
