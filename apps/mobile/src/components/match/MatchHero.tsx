import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui'
import { Icon } from '../ui/Icon'
import { LiveStatusPill, MatchStatus } from './LiveStatusPill'
import { useClubColors } from '../../context/ClubThemeContext'
import { useMatchTokens, HERO_CARD_OVERLAP, HERO_CARD_RADIUS } from '../../theme/matchTokens'
import { fontSize, fonts, space } from '../../theme/tokens'
import { TEXT_WHITE } from '../../theme/colors'

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
  const colors = useClubColors()
  const tokens = useMatchTokens()
  const insets = useSafeAreaInsets()

  const showScore =
    scoreHome !== undefined && scoreHome !== null && scoreAway !== undefined && scoreAway !== null

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.primary, paddingTop: insets.top + space.sm },
        ]}
      >
        <View
          pointerEvents="none"
          style={[styles.stripe, styles.stripe1, { backgroundColor: tokens.heroStripeTint }]}
        />
        <View
          pointerEvents="none"
          style={[styles.stripe, styles.stripe2, { backgroundColor: tokens.heroStripeTint }]}
        />
        <View
          pointerEvents="none"
          style={[styles.stripe, styles.stripe3, { backgroundColor: tokens.heroStripeTint }]}
        />

        <View style={styles.chrome}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backBtn}
              hitSlop={8}
            >
              <Icon name="chevron-back" size={20} color={TEXT_WHITE} />
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          <LiveStatusPill
            status={status}
            minute={minute}
            scheduledLabel={scheduledLabel}
            inverse
          />
        </View>

        <View style={styles.body}>
          <View style={styles.side}>
            <Crest badgeUrl={home.badgeUrl} fallbackText={home.shortName ?? home.name} />
            <Text numberOfLines={1} style={styles.sideName}>
              {home.shortName ?? home.name}
            </Text>
          </View>

          <View style={styles.center}>
            {showScore ? (
              <Text style={styles.score}>
                {scoreHome}–{scoreAway}
              </Text>
            ) : (
              <Text style={styles.score}>vs</Text>
            )}
            {(competition || stage) && (
              <Text style={styles.meta}>
                {[competition, stage].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>

          <View style={styles.side}>
            <Crest badgeUrl={away.badgeUrl} fallbackText={away.shortName ?? away.name} />
            <Text numberOfLines={1} style={styles.sideName}>
              {away.shortName ?? away.name}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.cardLip,
          {
            backgroundColor: tokens.cardSurface,
            borderTopLeftRadius: HERO_CARD_RADIUS,
            borderTopRightRadius: HERO_CARD_RADIUS,
          },
        ]}
      />
    </View>
  )
}

function Crest({ badgeUrl, fallbackText }: { badgeUrl?: string | null; fallbackText: string }) {
  if (badgeUrl) {
    return <Image source={{ uri: badgeUrl }} style={styles.crest} resizeMode="contain" />
  }
  const initials = fallbackText.slice(0, 3).toUpperCase()
  return (
    <View style={[styles.crest, styles.crestFallback]}>
      <Text style={styles.crestInitials}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  hero: {
    paddingBottom: space.xl + HERO_CARD_OVERLAP,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    width: '180%',
    height: 60,
    transform: [{ rotate: '-12deg' }],
    left: '-40%',
  },
  stripe1: { top: -10 },
  stripe2: { top: 90 },
  stripe3: { top: 190 },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    marginBottom: space.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  side: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
  },
  crest: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  crestFallback: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestInitials: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: TEXT_WHITE,
    letterSpacing: 1,
  },
  sideName: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    color: TEXT_WHITE,
    textAlign: 'center',
    opacity: 0.92,
  },
  center: {
    alignItems: 'center',
    minWidth: 90,
    gap: 4,
  },
  score: {
    fontFamily: fonts.data,
    fontSize: 38,
    fontWeight: '500',
    color: TEXT_WHITE,
    letterSpacing: -0.5,
  },
  meta: {
    fontFamily: fonts.label,
    fontSize: fontSize['2xs'],
    color: TEXT_WHITE,
    opacity: 0.78,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  cardLip: {
    height: HERO_CARD_OVERLAP,
    marginTop: -HERO_CARD_OVERLAP,
  },
})
