/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Linking, Pressable, StyleSheet, View } from 'react-native'
import type {
  AudioRecorder,
  PermissionResponse,
  RecordingOptions,
} from 'expo-audio'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize } from '../../theme/tokens'

/**
 * expo-audio is loaded lazily so the app can launch in builds where the native
 * module hasn't been linked yet (e.g., before `expo run:ios` rebuilds the
 * binary after adding expo-audio to package.json). When the module is missing,
 * the recorder explains that a newer build is required instead of failing silently.
 */
type AudioRuntime = {
  AudioModule: {
    AudioRecorder: new (options?: Partial<RecordingOptions>) => AudioRecorder
  }
  RecordingPresets: { HIGH_QUALITY: RecordingOptions }
  requestRecordingPermissionsAsync: () => Promise<PermissionResponse>
  setAudioModeAsync: (mode: {
    allowsRecording?: boolean
    playsInSilentMode?: boolean
    interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers'
  }) => Promise<void>
}

let _audio: AudioRuntime | null = null
let _audioLoadAttempted = false
function loadAudio(): AudioRuntime | null {
  if (_audioLoadAttempted) return _audio
  _audioLoadAttempted = true
  try {
    _audio = require('expo-audio') as AudioRuntime
  } catch {
    _audio = null
  }
  return _audio
}

export type VoiceRecorderResult = {
  uri: string
  durationMs: number
  contentType: string
}

export type VoiceRecorderButtonProps = {
  /** Called when the user finishes a recording (release after start). */
  onRecorded: (result: VoiceRecorderResult) => void
  /** Called when the user cancels (slide-out, swipe, error). */
  onCancel?: () => void
  disabled?: boolean
  size?: number
}

/**
 * Hold-to-record voice button. While the user is pressing, a red pulsing
 * dot + elapsed timer is shown next to the button. Release to send;
 * onPressOut completes the recording, onResponderTerminate cancels.
 */
export function VoiceRecorderButton({
  onRecorded,
  onCancel,
  disabled,
  size = 44,
}: VoiceRecorderButtonProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const Audio = loadAudio()
  const [recording, setRecording] = useState<AudioRecorder | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const pressedRef = useRef(false)
  const preparingRef = useRef(false)
  const stoppingRef = useRef(false)
  const mountedRef = useRef(true)
  const startedAtRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pulse = useRef(new Animated.Value(0.4)).current

  const resetAudioMode = () => Audio?.setAudioModeAsync({
    allowsRecording: false, playsInSilentMode: true, interruptionMode: 'mixWithOthers',
  }).catch(() => undefined)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pressedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      const recorder = recorderRef.current
      recorderRef.current = null
      if (recorder) void recorder.stop().catch(() => undefined).finally(() => {
        recorder.release()
        void resetAudioMode()
      })
    }
    // The lazy-loaded native runtime is stable for the component lifetime.
  }, [])

  useEffect(() => {
    if (!recording) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [recording, pulse])

  const start = async () => {
    pressedRef.current = true
    if (recorderRef.current || preparingRef.current || stoppingRef.current || disabled) return
    if (!Audio) {
      Alert.alert(t('common.error'), t('voiceRecording.unavailable'))
      return
    }
    preparingRef.current = true
    let rec: AudioRecorder | null = null
    try {
      const perm = await Audio.requestRecordingPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('voiceRecording.permissionTitle'), t('voiceRecording.permissionBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('voiceRecording.settings'), onPress: () => void Linking.openSettings() },
        ])
        onCancel?.()
        return
      }
      // A permission dialog or a quick tap can outlive the original press.
      // Never start a microphone recording after the user's finger is up.
      if (!mountedRef.current || !pressedRef.current) return
      await Audio.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      })
      rec = new Audio.AudioModule.AudioRecorder(
        Audio.RecordingPresets.HIGH_QUALITY,
      )
      await rec.prepareToRecordAsync(Audio.RecordingPresets.HIGH_QUALITY)
      if (!mountedRef.current || !pressedRef.current) {
        await rec.stop().catch(() => undefined)
        rec.release()
        rec = null
        await resetAudioMode()
        return
      }
      rec.record()
      recorderRef.current = rec
      setRecording(rec)
      startedAtRef.current = Date.now()
      setElapsed(0)
      intervalRef.current = setInterval(() => {
        setElapsed(
          startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        )
      }, 200)
    } catch {
      rec?.release()
      await resetAudioMode()
      if (mountedRef.current) Alert.alert(t('common.error'), t('voiceRecording.failed'))
      onCancel?.()
    } finally {
      preparingRef.current = false
    }
  }

  const stop = async (commit: boolean) => {
    pressedRef.current = false
    const rec = recorderRef.current
    if (!rec || stoppingRef.current) return
    recorderRef.current = null
    stoppingRef.current = true
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    try {
      await rec.stop()
      const uri = rec.uri
      const duration = startedAtRef.current
        ? Date.now() - startedAtRef.current
        : elapsed
      setRecording(null)
      startedAtRef.current = null
      setElapsed(0)
      if (commit && uri && duration >= 500 && mountedRef.current) {
        onRecorded({
          uri,
          durationMs: duration,
          contentType: 'audio/m4a',
        })
      } else {
        onCancel?.()
      }
    } catch {
      setRecording(null)
      startedAtRef.current = null
      setElapsed(0)
      if (mountedRef.current) Alert.alert(t('common.error'), t('voiceRecording.failed'))
      onCancel?.()
    } finally {
      rec.release()
      await resetAudioMode()
      stoppingRef.current = false
    }
  }

  const seconds = Math.floor(elapsed / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const time = `${m}:${s.toString().padStart(2, '0')}`

  return (
    <View style={styles.row}>
      {recording ? (
        <View style={styles.indicator}>
          <Animated.View
            style={[styles.dot, { backgroundColor: c.error, opacity: pulse }]}
          />
          <Text style={[styles.time, { color: c.textSecondary }]}>{time}</Text>
        </View>
      ) : null}
      <Pressable
        onPressIn={() => void start()}
        onPressOut={() => void stop(true)}
        onResponderTerminate={() => void stop(false)}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.recordVoiceNote')}
        accessibilityHint={t('voiceRecording.hold')}
        testID="chat-voice-record"
        disabled={disabled}
        style={({ pressed }) => [
          styles.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor:
              recording || pressed ? c.error : c.surfaceSunken,
          },
        ]}
      >
        <Icon
          name={recording ? 'stop.fill' : 'mic'}
          size={Math.round(size * 0.55)}
          color={recording ? '#FFFFFF' : c.textPrimary}
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  time: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
})
