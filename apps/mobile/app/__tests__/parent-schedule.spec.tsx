import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}))

import ParentScheduleScreen from '../parent-schedule'

const mockTheme = {
  clubPrimary: '#1E3A5F',
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'parentSchedule.title': 'Zeitplan der Kinder',
        'parentSchedule.empty': 'Leer',
        'parentSchedule.emptyDescription': 'Leer',
        'event.type.MATCH': 'Spiel',
      }

      return map[key] ?? key
    },
    i18n: {
      resolvedLanguage: 'de',
    },
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'club-1' }, role: 'PARENT' },
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() =>
    Promise.resolve([
      {
        id: 'event-1',
        type: 'MATCH',
        title: 'Auswärtsspiel gegen den Tabellenführer mit sehr langem Titel',
        date: '2026-03-26T10:00:00.000Z',
        location: 'Olympiapark Platz 7, München',
        teamName: 'U13',
        teamDisplayName: 'U13 Leistungskader mit extra langem Namen',
      },
    ]),
  ),
}))

jest.mock('../../src/components/EmptyState', () => ({
  EmptyState: () => null,
}))


jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'de',
  getAppLocale: () => 'de-DE',
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

describe('ParentScheduleScreen layout', () => {
  it('renders translated event types and allows the header badges to wrap', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<ParentScheduleScreen />)
    })

    const textNodes = tree!.root.findAllByType(Text)
    const typeLabel = textNodes.find((node: any) => collectText(node) === 'Spiel')
    const rawType = textNodes.find((node: any) => collectText(node) === 'MATCH')
    const wrappingHeader = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.flexWrap === 'wrap' && style?.marginBottom != null
    })

    expect(typeLabel).toBeTruthy()
    expect(rawType).toBeUndefined()
    expect(wrappingHeader).toBeTruthy()
  })
})
