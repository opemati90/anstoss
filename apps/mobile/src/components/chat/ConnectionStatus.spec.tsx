import { render } from '@testing-library/react-native'
import { ConnectionStatus } from './ConnectionStatus'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ warning: '#ffd700', error: '#ff0000', textInverse: '#ffffff' }),
}))
jest.mock('../../e2e/session', () => ({ getE2ESession: () => null }))

describe('ConnectionStatus', () => {
  it.each(['connecting', 'connected'] as const)('does not claim connection loss while %s', (state) => {
    const screen = render(<ConnectionStatus state={state} />)
    expect(screen.queryByText('chat.offline')).toBeNull()
    expect(screen.queryByText('chat.reconnecting')).toBeNull()
  })

  it('still reports genuine failure and recovery', () => {
    const screen = render(<ConnectionStatus state="offline" />)
    expect(screen.getByText('chat.offline')).toBeTruthy()
    screen.rerender(<ConnectionStatus state="reconnecting" />)
    expect(screen.getByText('chat.reconnecting')).toBeTruthy()
    expect(screen.queryByText('chat.offline')).toBeNull()
  })
})
