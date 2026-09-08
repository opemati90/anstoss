import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ChatInput } from './ChatInput'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#111111',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textTertiary: '#777777',
    textInverse: '#ffffff',
    surface: '#ffffff',
    surfaceSunken: '#f4f4f4',
    borderDefault: '#dddddd',
    borderSubtle: '#eeeeee',
    error: '#b00020',
  }),
}))

jest.mock('./VoiceRecorderButton', () => ({
  VoiceRecorderButton: () => {
    const { Text } = require('react-native')
    return <Text testID="voice-recorder">voice</Text>
  },
}))

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}))

describe('ChatInput', () => {
  it('keeps the send button mounted with a busy state while text is sending', async () => {
    let resolveSend: (value: boolean) => void = () => undefined
    const onSend = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve
        }),
    )

    const screen = render(
      <ChatInput
        onSend={onSend}
        onSendAttachment={jest.fn()}
        onTyping={jest.fn()}
        primaryColor="#111111"
      />,
    )

    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'hello')
    fireEvent.press(screen.getByTestId('chat-send-message'))

    expect(onSend).toHaveBeenCalledWith('hello')
    expect(screen.getByTestId('chat-send-message').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    })
    expect(screen.queryByTestId('voice-recorder')).toBeNull()

    resolveSend(true)
    await waitFor(() => expect(screen.getByTestId('voice-recorder')).toBeTruthy())
  })
})
