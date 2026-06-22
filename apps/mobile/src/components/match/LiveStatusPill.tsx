import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useMatchTokens } from '../../theme/matchTokens'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type MatchStatus = 'scheduled' | 'live' | 'final'

export type LiveStatusPillProps = {
  status: MatchStatus
  minute?: number
  finalScore?: string
  scheduledLabel?: string
  inverse?: boolean
}

export function LiveStatusPill({
  status,
  minute,
  finalScore,
  scheduledLabel,
  inverse,
}: LiveStatusPillProps) {
  const tokens = useMatchTokens()
  const pulse = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    if (status !== 'live') return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, pulse])

  const bg =
    status === 'live'
      ? tokens.statusLive
      : status === 'final'
        ? tokens.statusFinal
        : tokens.statusUpcoming
  const inverseBg = inverse ? tokens.statusLiveText : bg
  const inverseText = inverse ? tokens.cardText : tokens.statusLiveText
  const dotColor = inverse ? tokens.statusLive : tokens.statusLiveText

  const label =
    status === 'live'
      ? minute !== undefined
        ? `LIVE · ${minute}'`
        : 'WATCH LIVE'
      : status === 'final'
        ? `FT${finalScore ? ` · ${finalScore}` : ''}`
        : (scheduledLabel ?? 'UPCOMING')

  return (
    <View style={[styles.pill, { backgroundColor: inverseBg }]}>
      {status === 'live' && (
        <Animated.View
          style={[styles.dot, { backgroundColor: dotColor, opacity: pulse }]}
        />
      )}
      <Text style={[styles.text, { color: inverseText }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + space['2xs'],
    paddingHorizontal: space.md,
    paddingVertical: space.sm - space['2xs'],
    borderRadius: radius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  text: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
  },
})