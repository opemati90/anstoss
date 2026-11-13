import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconButton, Text } from '../ui'
import { Icon } from '../ui/Icon'
import type { MatchStatus } from './LiveStatusPill'
import { MatchCrest } from './MatchCrest'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import {
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXL,
} from '../../theme/tokens'

export type MatchHeroSide = {
  name: string
  shortName?: string
  badgeUrl?: string | null
}

export type MatchHeroProps = {
  home: MatchHeroSide
  away: MatchHeroSide
  status: MatchStatus
  scoreHome?: number | null
  scoreAway?: number | null
  minute?: number
  competition?: string
  stage?: string
  scheduledLabel?: string
  onBack?: () => void
}

const SCORE_SIZE = 72
const STATUS_DOT = 8

/**
 * Club-coloured live score hero (design 14 Live-Spiel): back button, a
 * "● LIVE · 63'" status line, both crests and the Barlow score at 72pt.
 * Text uses `onPrimary` so a light club colour (or the lifted dark-mode
 * primary) keeps legible copy.
 */
export function MatchHero({
  home,
  away,
  status,
  scoreHome,
  scoreAway,
  minute,
  competition,
  stage,
  scheduledLabel,
  onBack,
}: MatchHeroProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const onHero = c.onPrimary
  const onHeroMuted = hexToRgba(onHero, 0.78)

  const showScore = scoreHome != null && scoreAway != null

  const statusLabel =
    status === 'live'
      ? minute !== undefined
        ? t('matchLive.liveMinute', { defaultValue: "LIVE · {{minute}}'", minute })
        : t('matchLive.liveShort', { defaultValue: 'LIVE' })
      : status === 'final'
        ? t('matchLive.fullTime', { defaultValue: 'Full time' })
        : (scheduledLabel ?? t('matchLive.upcoming', { defaultValue: 'Upcoming' }))

  const meta = [competition, stage].filter(Boolean).join(' · ')
  const scoreA11y = showScore
    ? `${home.name} ${scoreHome}, ${away.name} ${scoreAway}`
    : `${home.name} – ${away.name}`

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: c.primary, paddingTop: insets.top + SPACING_MD },
      ]}
    >
      <View style={styles.chrome}>
        {onBack ? (
          <IconButton
            variant="onHero"
            onPress={onBack}
            accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          >
            <Icon name="chevron.left" size={20} color={onHero} />
          </IconButton>
        ) : (
          <View style={styles.chromeSpacer} />
        )}
        <View style={styles.status} accessibilityRole="text">
          {status === 'live' ? (
            <View style={[styles.statusDot, { backgroundColor: c.accent }]} />
          ) : null}
          <Text variant="footnote" weight="bold" style={{ color: onHero }}>
            {statusLabel}
          </Text>
        </View>
        <View style={styles.chromeSpacer} />
      </View>

      <View style={styles.body} accessible accessibilityLabel={scoreA11y}>
        <View style={styles.side}>
          <MatchCrest name={home.name} badgeUrl={home.badgeUrl} />
          <Text
            variant="footnote"
            weight="semibold"
            align="center"
            numberOfLines={2}
            style={{ color: onHero }}
          >
            {home.shortName ?? home.name}
          </Text>
        </View>

        <Text
          variant="dataLarge"
          style={[styles.score, { color: onHero }]}
          maxFontSizeMultiplier={1}
        >
          {showScore ? `${scoreHome}:${scoreAway}` : '–:–'}
        </Text>

        <View style={styles.side}>
          <MatchCrest name={away.name} badgeUrl={away.badgeUrl} />
          <Text
            variant="footnote"
            weight="semibold"
            align="center"
            numberOfLines={2}
            style={{ color: onHero }}
          >
            {away.shortName ?? away.name}
          </Text>
        </View>
      </View>

      {meta ? (
        <Text variant="caption1" align="center" numberOfLines={1} style={{ color: onHeroMuted }}>
          {meta}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_XXL + SPACING_XS,
    gap: SPACING_XL,
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chromeSpacer: { width: 44, height: 44 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  statusDot: {
    width: STATUS_DOT,
    height: STATUS_DOT,
    borderRadius: RADIUS_FULL,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
  },
  side: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING_SM,
  },
  score: {
    fontSize: SCORE_SIZE,
    lineHeight: SCORE_SIZE,
  },
})
