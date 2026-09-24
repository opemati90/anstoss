import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { UserReportSheet } from './UserReportSheet'

const mockApi = jest.fn()

jest.mock('../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#111111',
    background: '#ffffff',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textTertiary: '#777777',
    textInverse: '#ffffff',
    surface: '#ffffff',
    surfaceSunken: '#f4f4f4',
    surfaceOverlay: 'rgba(0,0,0,0.4)',
    borderDefault: '#dddddd',
    borderStrong: '#999999',
    borderSubtle: '#eeeeee',
    error: '#b00020',
  }),
}))

const history = {
  messages: [
    { id: 'dm-1', senderId: 'peer', content: 'Erste', messageType: 'TEXT' },
    { id: 'dm-2', senderId: 'me', content: 'Antwort', messageType: 'TEXT' },
    { id: 'dm-3', senderId: 'peer', content: 'Zuletzt vom Peer', messageType: 'TEXT' },
  ],
  hasMore: false,
}

describe('UserReportSheet (M6)', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('reports exactly the message the reporter picks, with the reason from the sheet, never via Alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    mockApi.mockImplementation((path: string) =>
      path.endsWith('/messages') ? Promise.resolve(history) : Promise.resolve({ ok: true }),
    )
    const screen = render(
      <UserReportSheet
        visible
        onClose={jest.fn()}
        clubId="club-1"
        conversationId="conv-1"
        peer={{ id: 'peer', name: 'Tim Weber' }}
      />,
    )

    await waitFor(() => expect(screen.getByText('Zuletzt vom Peer')).toBeTruthy())
    // The viewer's own message is never offered.
    expect(screen.queryByTestId('chat-report-message-dm-2')).toBeNull()
    // Nothing is preselected: a reason alone does not submit.
    fireEvent.press(screen.getByTestId('chat-report-reason-ABUSE'))
    fireEvent.press(screen.getByTestId('chat-report-submit'))
    expect(mockApi).toHaveBeenCalledTimes(1)

    // Pick the OLDER peer message, not the latest.
    fireEvent.press(screen.getByTestId('chat-report-message-dm-1'))
    fireEvent.press(screen.getByTestId('chat-report-submit'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/direct-messages/dm-1/report', {
        method: 'POST',
        body: { reason: 'ABUSE' },
      }),
    )
    await waitFor(() => expect(screen.getByText('chatInbox.report.sent')).toBeTruthy())
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('offers the Kinderschutz reason with its platform-team note', async () => {
    mockApi.mockResolvedValue(history)
    const screen = render(
      <UserReportSheet
        visible
        onClose={jest.fn()}
        clubId="club-1"
        conversationId="conv-1"
        peer={{ id: 'peer', name: 'Tim Weber' }}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('chat-report-reason-SAFEGUARDING')).toBeTruthy())
    expect(screen.getByText('chatThread.report.safeguardingHint')).toBeTruthy()
  })

  it('never reports the viewer’s own message when the peer has written nothing', async () => {
    mockApi.mockResolvedValue({ messages: [{ id: 'dm-9', senderId: 'me', content: 'Hallo' }] })
    const screen = render(
      <UserReportSheet
        visible
        onClose={jest.fn()}
        clubId="club-1"
        conversationId="conv-1"
        peer={{ id: 'peer', name: 'Tim Weber' }}
      />,
    )
    await waitFor(() => expect(screen.getByText('chatHub.info.reportNothingBody')).toBeTruthy())
    expect(screen.queryByTestId('chat-report-submit')).toBeNull()
  })
})
