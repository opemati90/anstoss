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
        onVoiceRecorded={jest.fn()}
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

  it('restores and clears a per-conversation draft', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default
    await AsyncStorage.setItem('chat:draft:dm:c-1', 'Treffpunkt 17:30?')
    const onSend = jest.fn().mockResolvedValue(true)
    const screen = render(
      <ChatInput onSend={onSend} onTyping={jest.fn()} draftKey="dm:c-1" onVoiceRecorded={jest.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('chat-message-input').props.value).toBe('Treffpunkt 17:30?'),
    )
    fireEvent.press(screen.getByTestId('chat-send-message'))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Treffpunkt 17:30?'))
    await waitFor(
      async () => expect(await AsyncStorage.getItem('chat:draft:dm:c-1')).toBeNull(),
      { timeout: 1500 },
    )
  })

  it('offers the + menu and the camera shortcut only while empty', () => {
    const onOpenMenu = jest.fn()
    const onCamera = jest.fn()
    const screen = render(
      <ChatInput onSend={jest.fn()} onTyping={jest.fn()} onOpenMenu={onOpenMenu} onCamera={onCamera} />,
    )
    fireEvent.press(screen.getByTestId('chat-attach-open'))
    expect(onOpenMenu).toHaveBeenCalled()
    expect(screen.getByTestId('chat-camera')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Hallo')
    expect(screen.queryByTestId('chat-camera')).toBeNull()
  })
})
