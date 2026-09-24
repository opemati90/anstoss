import { useEffect, useMemo, useRef, useState } from 'react'
import { type GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AudioPlayer } from 'expo-audio'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { space } from '../../theme/tokens'

/**
 * Voice note: play/pause, a waveform that fills as it plays, and scrubbing
 * (tap or drag across the waveform to seek). expo-audio is loaded lazily so
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

const BAR_COUNT = 32

/** Stored peaks when present, else a stable pseudo-waveform from the id. */
export function waveformBars(seed: string, peaks?: number[] | null): number[] {
  if (peaks && peaks.length > 0) {
    const out: number[] = []
    for (let i = 0; i < BAR_COUNT; i++) {
      const v = peaks[Math.floor((i / BAR_COUNT) * peaks.length)] ?? 0
      out.push(Math.max(0.12, Math.min(1, v)))
    }
    return out
  }
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) | 0
  const out: number[] = []
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) | 0
    out.push(0.2 + (Math.abs(h) % 80) / 100)
  }
  return out
}

function formatMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`
}

export type VoiceMessagePlayerProps = {
  url: string
  /** Seed for the fallback waveform (message id). */
  seed?: string
  durationMs?: number | null
  peaks?: number[] | null
  iconColor: string
  /** Played part of the waveform. */
  activeColor?: string
  waveformColor: string
  durationColor: string
  /** Legacy prop: preformatted duration. */
  durationLabel?: string
}

export function VoiceMessagePlayer({
  url,
  seed = url,
  durationMs,
  peaks,
  iconColor,
  activeColor,
  waveformColor,
  durationColor,
  durationLabel,
}: VoiceMessagePlayerProps) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(durationMs ?? 0)
  const [trackWidth, setTrackWidth] = useState(0)
  const playerRef = useRef<AudioPlayer | null>(null)
  const statusSubRef = useRef<{ remove: () => void } | null>(null)
  const bars = useMemo(() => waveformBars(seed, peaks), [peaks, seed])

  useEffect(() => {
    return () => {
      statusSubRef.current?.remove()
      statusSubRef.current = null
      const player = playerRef.current
      playerRef.current = null
      player?.remove()
    }
  }, [])

  const ensurePlayer = async (): Promise<AudioPlayer | null> => {
    if (playerRef.current) return playerRef.current
    const Audio = loadAudio()
    if (!Audio || !url) return null
    setLoading(true)
    try {
      await Audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })
      const player = Audio.createAudioPlayer({ uri: url }, { updateInterval: 100, keepAudioSessionActive: false })
      playerRef.current = player
      statusSubRef.current = player.addListener('playbackStatusUpdate', (status) => {
        if (status.duration) setDuration(status.duration * 1000)
        setPosition((status.currentTime ?? 0) * 1000)
        if (status.didJustFinish) {
          setPlaying(false)
          setPosition(0)
          void player.seekTo(0)
        }
      })
      return player
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    if (loading) return
    const player = await ensurePlayer()
    if (!player) return
    if (playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.play()
      setPlaying(true)
    }
  }

  const seekTo = async (x: number) => {
    if (trackWidth <= 0 || duration <= 0) return
    const ratio = Math.max(0, Math.min(1, x / trackWidth))
    setPosition(ratio * duration)
    const player = await ensurePlayer()
    if (player) void player.seekTo((ratio * duration) / 1000)
  }

  const progress = duration > 0 ? Math.min(1, position / duration) : 0
  const label =
    position > 0 ? formatMs(position) : duration > 0 ? formatMs(duration) : (durationLabel ?? '0:00')

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('chatThread.voice.pause') : t('chatThread.voice.play')}
        hitSlop={6}
        style={styles.play}
      >
        <Icon name={playing ? 'pause.fill' : 'play.fill'} size={22} color={iconColor} />
      </Pressable>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => void seekTo(e.nativeEvent.locationX)}
        onResponderMove={(e: GestureResponderEvent) => setPosition(
          trackWidth > 0 && duration > 0
            ? Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth)) * duration
            : position,
        )}
        onResponderRelease={(e: GestureResponderEvent) => void seekTo(e.nativeEvent.locationX)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('chatThread.voice.scrub')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = trackWidth * 0.1
          const current = progress * trackWidth
          void seekTo(event.nativeEvent.actionName === 'increment' ? current + step : current - step)
        }}
      >
        {bars.map((value, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: Math.round(4 + value * 20),
                backgroundColor: index / bars.length < progress ? (activeColor ?? iconColor) : waveformColor,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="caption1" tabular style={{ color: durationColor }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 200 },
  play: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  track: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 96,
  },
  bar: { width: 2, borderRadius: 1 },
})
