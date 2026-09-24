import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { ReportSheet } from './ReportSheet'

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

describe('ReportSheet (M6: report a specific message from its long-press menu)', () => {
  beforeEach(() => mockApi.mockReset().mockResolvedValue({ ok: true }))

  it('reports the exact DM message with the reason picked in the sheet (no Alert)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const screen = render(
      <ReportSheet
        target={{ mode: 'report', messageId: 'dm-42', isDm: true, senderId: 'peer', senderName: 'Tim Weber' }}
        onClose={jest.fn()}
      />,
    )
    // All five reasons render as rows, including Kinderschutz with its note.
    for (const reason of ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'SAFEGUARDING', 'OTHER']) {
      expect(screen.getByTestId(`chat-report-reason-${reason}`)).toBeTruthy()
    }
    expect(screen.getByText('chatThread.report.safeguardingHint')).toBeTruthy()

    fireEvent.press(screen.getByTestId('chat-report-reason-SAFEGUARDING'))
    fireEvent.press(screen.getByTestId('chat-report-submit'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/direct-messages/dm-42/report', {
        method: 'POST',
        body: { reason: 'SAFEGUARDING' },
      }),
    )
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('reports channel messages on the channel endpoint', async () => {
    const screen = render(
      <ReportSheet
        target={{ mode: 'report', messageId: 'msg-7', isDm: false, senderId: 'u', senderName: 'Lukas' }}
        onClose={jest.fn()}
      />,
    )
    fireEvent.press(screen.getByTestId('chat-report-reason-SPAM'))
    fireEvent.press(screen.getByTestId('chat-report-submit'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/messages/msg-7/report', { method: 'POST', body: { reason: 'SPAM' } }),
    )
  })

  it('blocks the sender of the message in DMs', async () => {
    const onBlocked = jest.fn()
    const screen = render(
      <ReportSheet
        target={{ mode: 'block', messageId: 'dm-1', isDm: true, senderId: 'peer', senderName: 'Tim Weber' }}
        onClose={jest.fn()}
        onBlocked={onBlocked}
      />,
    )
    fireEvent.press(screen.getByTestId('chat-block-confirm'))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/users/peer/block', { method: 'POST' }))
    await waitFor(() => expect(onBlocked).toHaveBeenCalledWith('peer'))
  })
})
