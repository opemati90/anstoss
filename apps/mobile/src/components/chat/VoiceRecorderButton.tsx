/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Animated, NativeModules, Pressable, StyleSheet, View } from 'react-native'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize } from '../../theme/tokens'

/**
 * expo-av is loaded lazily so the app can launch in builds where the native
 * module hasn't been linked yet (e.g., before `expo run:ios` rebuilds the
 * binary after adding expo-av to package.json). When the module is missing,
 * the recorder gracefully no-ops.
 *
 * We check NativeModules.ExponentAV BEFORE require()-ing expo-av — that way
 * the native module is never accessed and no error is logged to the RN
 * dev redbox.
 */
type AudioModule = { Recording: any; RecordingOptionsPresets: any; setAudioModeAsync: any; requestPermissionsAsync: any }
let _audio: AudioModule | null = null
let _audioLoadAttempted = false
function loadAudio(): AudioModule | null {
  if (_audioLoadAttempted) return _audio
  _audioLoadAttempted = true
  // Only attempt require() when the native module is actually present —
  // avoids triggering ExponentAV's "Cannot find native module" error at all.
  if (!NativeModules.ExponentAV) {
    _audio = null
    return null
  }
  try {
    _audio = (require('expo-av') as { Audio: AudioModule }).Audio
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
  const c = useClubColors()
  const Audio = loadAudio()
  const [recording, setRecording] = useState<any>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pulse = useRef(new Animated.Value(0.4)).current

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
    if (recording || disabled || !Audio) {
      onCancel?.()
      return
    }
    try {
      const perm = await Audio.requestPermissionsAsync()
      if (!perm.granted) {
        onCancel?.()
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      const rec = new Audio.Recording()
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      )
      await rec.startAsync()
      setRecording(rec)
      startedAtRef.current = Date.now()
      setElapsed(0)
      intervalRef.current = setInterval(() => {
        setElapsed(
          startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        )
      }, 200)
    } catch {
      onCancel?.()
    }
  }

  const stop = async (commit: boolean) => {
    if (!recording) return
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    try {
      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      const duration = startedAtRef.current
        ? Date.now() - startedAtRef.current
        : elapsed
      setRecording(null)
      startedAtRef.current = null
      setElapsed(0)
      if (commit && uri && duration >= 500) {
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
      onCancel?.()
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
        accessibilityLabel="Record voice note"
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