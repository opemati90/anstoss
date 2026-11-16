import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
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
  it('does not restore a stale draft after the user has typed and cleared the composer', async () => {
    const storage = require('@react-native-async-storage/async-storage').default
    let resolveDraft!: (value: string) => void
    storage.getItem.mockImplementationOnce(
      () => new Promise<string>((resolve) => { resolveDraft = resolve }),
    )
    const screen = render(<ChatInput onSend={jest.fn()} onTyping={jest.fn()} draftKey="dm:slow-restore" />)
    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'New edit')
    fireEvent.changeText(screen.getByTestId('chat-message-input'), '')
    await act(async () => { resolveDraft('Stale saved draft') })
    expect(screen.getByTestId('chat-message-input').props.value).toBe('')
    screen.unmount()
  })

  it('persists the final edit when leaving before the draft debounce', async () => {
    const storage = require('@react-native-async-storage/async-storage').default
    const screen = render(<ChatInput onSend={jest.fn()} onTyping={jest.fn()} draftKey="dm:quick-exit" />)
    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Keep this draft')
    screen.unmount()
    expect(await storage.getItem('chat:draft:dm:quick-exit')).toBe('Keep this draft')
  })

  it('removes a cleared draft immediately even when leaving before the debounce', async () => {
    const storage = require('@react-native-async-storage/async-storage').default
    await storage.setItem('chat:draft:dm:quick-clear', 'Old draft')
    const screen = render(<ChatInput onSend={jest.fn()} onTyping={jest.fn()} draftKey="dm:quick-clear" />)
    await waitFor(() => expect(screen.getByTestId('chat-message-input').props.value).toBe('Old draft'))
    fireEvent.changeText(screen.getByTestId('chat-message-input'), '')
    screen.unmount()
    expect(await storage.getItem('chat:draft:dm:quick-clear')).toBeNull()
  })

  it('supports 200% text without an unbounded composer font', () => {
    const screen = render(<ChatInput onSend={jest.fn()} onTyping={jest.fn()} />)
    expect(screen.getByTestId('chat-message-input').props.maxFontSizeMultiplier).toBe(2)
  })

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
