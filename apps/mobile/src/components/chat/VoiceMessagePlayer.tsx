import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { AudioPlayer } from 'expo-audio'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { space } from '../../theme/tokens'

/**
 * Tap-to-play for a received VOICE chat message. expo-audio is loaded lazily so
 * older native binaries render inertly instead of crashing before rebuild.
 */
type AudioRuntime = {
  createAudioPlayer: (
    source?: string | { uri: string } | null,
    options?: { updateInterval?: number; keepAudioSessionActive?: boolean },
  ) => AudioPlayer
  setAudioModeAsync: (mode: {
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
  const playerRef = useRef<AudioPlayer | null>(null)
  const statusSubRef = useRef<{ remove: () => void } | null>(null)

  // Unload the sound when the bubble unmounts so we don't leak audio sessions.
  useEffect(() => {
    return () => {
      statusSubRef.current?.remove()
      statusSubRef.current = null
      const player = playerRef.current
      playerRef.current = null
      player?.remove()
    }
  }, [])

  const handlePress = async () => {
    const Audio = loadAudio()
    if (!Audio || loading) return

    // Already loaded — toggle play/pause.
    if (playerRef.current) {
      if (playing) {
        playerRef.current.pause()
        setPlaying(false)
      } else {
        playerRef.current.play()
        setPlaying(true)
      }
      return
    }

    // First tap — load + play.
    setLoading(true)
    try {
      await Audio.setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
      })
      const player = Audio.createAudioPlayer(
        { uri: url },
        { updateInterval: 500, keepAudioSessionActive: false },
      )
      playerRef.current = player
      setPlaying(true)
      statusSubRef.current = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPlaying(false)
          void player.seekTo(0)
        }
      })
      player.play()
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
