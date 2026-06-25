import { useEffect, useRef, useState } from 'react'
import { NativeModules, Pressable, StyleSheet, View } from 'react-native'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { space } from '../../theme/tokens'

/**
 * Tap-to-play for a received VOICE chat message. expo-av is loaded lazily and
 * guarded on the native module (mirrors VoiceRecorderButton) so the app still
 * launches in builds without expo-av — there the row just renders inert.
 */
type AudioModule = { Sound: any; setAudioModeAsync: any }
let _audio: AudioModule | null = null
let _audioLoadAttempted = false
function loadAudio(): AudioModule | null {
  if (_audioLoadAttempted) return _audio
  _audioLoadAttempted = true
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

export type VoiceMessagePlayerProps = {
  url: string
  durationLabel: string
  iconColor: string
  waveformColor: string
  durationColor: string
}

export function VoiceMessagePlayer({
  url,
  durationLabel,
  iconColor,
  waveformColor,
  durationColor,
}: VoiceMessagePlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const soundRef = useRef<any>(null)

  // Unload the sound when the bubble unmounts so we don't leak audio sessions.
  useEffect(() => {
    return () => {
      const sound = soundRef.current
      soundRef.current = null
      if (sound) void sound.unloadAsync?.()
    }
  }, [])

  const handlePress = async () => {
    const Audio = loadAudio()
    if (!Audio || loading) return

    // Already loaded — toggle play/pause.
    if (soundRef.current) {
      if (playing) {
        await soundRef.current.pauseAsync()
        setPlaying(false)
      } else {
        await soundRef.current.playAsync()
        setPlaying(true)
      }
      return
    }

    // First tap — load + play.
    setLoading(true)
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true })
      soundRef.current = sound
      setPlaying(true)
      sound.setOnPlaybackStatusUpdate((status: { didJustFinish?: boolean }) => {
        if (status?.didJustFinish) {
          setPlaying(false)
          void sound.setPositionAsync(0)
        }
      })
    } catch {
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Pressable
      onPress={() => void handlePress()}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
      style={styles.row}
      hitSlop={6}
    >
      <Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color={iconColor} />
      <View style={[styles.waveform, { backgroundColor: waveformColor }]} />
      <Text variant="caption2" tabular style={{ color: durationColor }}>
        {durationLabel}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space['2xs'],
  },
  waveform: {
    flex: 1,
    height: 4,
    borderRadius: space['2xs'],
    minWidth: 80,
  },
})
