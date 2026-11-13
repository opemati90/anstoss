import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { hexToRgba } from '../../theme/club-theme'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type MatchStatus = 'scheduled' | 'live' | 'final'

export type LiveStatusPillProps = {
  status: MatchStatus
  minute?: number
  finalScore?: string
  scheduledLabel?: string
  /** On a club-coloured hero: translucent pill in the hero's text colour. */
  inverse?: boolean
}

/**
 * Match status pill (2026-11 redesign): live is an ink pill with a pulsing
 * lime dot ("● LIVE · 63'"); full time and upcoming are quiet muted pills.
 * On a club hero it follows the hero's text colour instead.
 */
export function LiveStatusPill({
  status,
  minute,
  finalScore,
  scheduledLabel,
  inverse,
}: LiveStatusPillProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const reduceMotion = useReducedMotion()
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (status !== 'live' || reduceMotion) {
      pulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, pulse, reduceMotion])

  const live = status === 'live'
  const bg = inverse
    ? hexToRgba(c.onHeroBg, 0.16)
    : live
      ? c.ink
      : c.surfaceMuted
  const fg = inverse ? c.onHeroBg : live ? c.onInk : c.textPrimary

  const label = live
    ? minute !== undefined
      ? t('matchLive.liveMinute', { defaultValue: "LIVE · {{minute}}'", minute })
      : t('matchLive.liveShort', { defaultValue: 'LIVE' })
    : status === 'final'
      ? `${t('matchLive.fullTime', { defaultValue: 'Full time' })}${finalScore ? ` · ${finalScore}` : ''}`
      : (scheduledLabel ?? t('matchLive.upcoming', { defaultValue: 'Upcoming' }))

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {live ? (
        <Animated.View style={[styles.dot, { backgroundColor: c.accent, opacity: pulse }]} />
      ) : null}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
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
    width: space.sm,
    height: space.sm,
    borderRadius: radius.full,
  },
  text: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
