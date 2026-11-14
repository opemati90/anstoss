import { fireEvent, render } from '@testing-library/react-native'
import { AttachmentMenuSheet } from './AttachmentMenuSheet'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../context/ClubThemeContext', () => ({ useClubColors: () => ({}) }))

describe('chat attachment permissions', () => {
  it('hides lineup tools by default but leaves normal player attachments available', () => {
    const screen = render(<AttachmentMenuSheet visible onClose={jest.fn()} onSelect={jest.fn()} />)
    expect(screen.queryByTestId('chat-attach-lineup')).toBeNull()
    for (const action of ['library', 'camera', 'file', 'voice']) {
      expect(screen.getByTestId(`chat-attach-${action}`)).toBeTruthy()
    }
  })
  it('shows the coach action and removes it if coaching permission is revoked', () => {
    const onSelect = jest.fn()
    const screen = render(<AttachmentMenuSheet visible showLineup onClose={jest.fn()} onSelect={onSelect} />)
    fireEvent.press(screen.getByTestId('chat-attach-lineup'))
    expect(onSelect).toHaveBeenCalledWith('lineup')
    screen.rerender(<AttachmentMenuSheet visible showLineup={false} onClose={jest.fn()} onSelect={onSelect} />)
    expect(screen.queryByTestId('chat-attach-lineup')).toBeNull()
  })
})
