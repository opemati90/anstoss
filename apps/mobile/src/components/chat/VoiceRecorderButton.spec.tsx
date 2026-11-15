import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { VoiceRecorderButton } from './VoiceRecorderButton'

const mockRecorder = {
  prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(),
  release: jest.fn(), uri: 'file:///recording.m4a',
}
const mockPermission = jest.fn()
const mockAudioMode = jest.fn()
jest.mock('expo-audio', () => ({
  AudioModule: { AudioRecorder: jest.fn(() => mockRecorder) },
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  setAudioModeAsync: (...args: unknown[]) => mockAudioMode(...args),
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ error: '#b00020', textPrimary: '#111111', textSecondary: '#555555', surfaceSunken: '#eeeeee' }),
}))

describe('VoiceRecorderButton lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPermission.mockResolvedValue({ granted: true })
    mockAudioMode.mockResolvedValue(undefined)
    mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined)
    mockRecorder.stop.mockResolvedValue(undefined)
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('does not start recording after release while the permission dialog is pending', async () => {
    let grant!: (permission: { granted: boolean }) => void
    mockPermission.mockImplementation(() => new Promise((resolve) => { grant = resolve }))
    const onRecorded = jest.fn()
    const screen = render(<VoiceRecorderButton onRecorded={onRecorded} />)
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn')
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressOut')
    await act(async () => grant({ granted: true }))
    expect(mockRecorder.record).not.toHaveBeenCalled()
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('releases a prepared recorder when the finger was lifted during preparation', async () => {
    let prepare!: () => void
    mockRecorder.prepareToRecordAsync.mockImplementation(() => new Promise<void>((resolve) => { prepare = resolve }))
    const screen = render(<VoiceRecorderButton onRecorded={jest.fn()} />)
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn')
    await waitFor(() => expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled())
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressOut')
    await act(async () => prepare())
    expect(mockRecorder.record).not.toHaveBeenCalled()
    expect(mockRecorder.release).toHaveBeenCalledTimes(1)
    expect(mockAudioMode).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }))
  })

  it('stops and delivers a held recording once, then restores playback audio mode', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000)
    const onRecorded = jest.fn()
    const screen = render(<VoiceRecorderButton onRecorded={onRecorded} />)
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn')
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled())
    now.mockReturnValue(2500)
    await act(async () => fireEvent(screen.getByTestId('chat-voice-record'), 'pressOut'))
    expect(onRecorded).toHaveBeenCalledWith({ uri: 'file:///recording.m4a', durationMs: 1500, contentType: 'audio/m4a' })
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1)
    expect(mockRecorder.release).toHaveBeenCalledTimes(1)
    expect(mockAudioMode).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }))
  })

  it('stops the microphone on leaving the screen without sending', async () => {
    const onRecorded = jest.fn()
    const screen = render(<VoiceRecorderButton onRecorded={onRecorded} />)
    fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn')
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled())
    await act(async () => screen.unmount())
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1)
    expect(mockRecorder.release).toHaveBeenCalledTimes(1)
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('explains denied microphone permission instead of silently doing nothing', async () => {
    mockPermission.mockResolvedValue({ granted: false })
    const screen = render(<VoiceRecorderButton onRecorded={jest.fn()} />)
    await act(async () => fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn'))
    expect(Alert.alert).toHaveBeenCalledWith('voiceRecording.permissionTitle', 'voiceRecording.permissionBody', expect.any(Array))
    expect(mockRecorder.record).not.toHaveBeenCalled()
  })

  it('reports native preparation failure and restores audio mode', async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValue(new Error('Audio session interrupted'))
    const screen = render(<VoiceRecorderButton onRecorded={jest.fn()} />)
    await act(async () => fireEvent(screen.getByTestId('chat-voice-record'), 'pressIn'))
    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'voiceRecording.failed')
    expect(mockRecorder.release).toHaveBeenCalledTimes(1)
  })
})
