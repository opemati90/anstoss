import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { ChannelRail } from './ChannelRail'

const mockApi = jest.fn()

jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#aa0033',
    primary50: '#fbe8ee',
    surfaceSunken: '#f4f4f5',
    borderDefault: '#d9dce3',
    textPrimary: '#111827',
  }),
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../ui', () => ({
  Icon: () => null,
  Text: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ChannelRail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockResolvedValue([
      { id: 'channel-1', kind: 'TEAM', name: 'General', slug: 'general', unreadCount: 0 },
    ])
  })

  it('does not refetch when selection UI state or callback identity changes', async () => {
    const firstSelect = jest.fn()
    let tree: { update: (element: React.ReactElement) => void }

    await act(async () => {
      tree = renderer.create(
        <ChannelRail
          teamId="team-1"
          selectedChannelId={null}
          onSelect={firstSelect}
        />,
      )
      await Promise.resolve()
    })

    expect(mockApi).toHaveBeenCalledTimes(1)

    await act(async () => {
      tree!.update(
        <ChannelRail
          teamId="team-1"
          selectedChannelId="channel-1"
          onSelect={jest.fn()}
        />,
      )
      await Promise.resolve()
    })

    expect(mockApi).toHaveBeenCalledTimes(1)
  })
})
