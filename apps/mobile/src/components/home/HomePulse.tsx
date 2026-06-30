import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useStreaks } from '../../hooks/useStreaks'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { space, radius, hairline } from '../../theme/tokens'

/**
 * Home pulse — a slim, tappable form banner that pulls the verified
 * engagement loop (slices 3–4) onto the feed: the member's live attendance
 * streak, their club rank, and who's currently in form ("who made it
 * happen"). Backed by the club's own ops graph, so it's truth, not a scrape.
 *
 * Renders nothing until there's a signal worth showing — a brand-new member
 * with no streak, rank, or in-form leader sees no empty noise.
 */
export function HomePulse() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const c = useClubColors()
  const { data } = useStreaks()

  const me = data?.me
  const board = data?.leaderboard ?? []
  const streakWeeks = me?.attendanceWeeks ?? 0
  const rank = user ? board.findIndex((e) => e.userId === user.id) + 1 : 0
  const leader = board.find((e) => e.motmWeeks > 0 || e.attendanceWeeks > 0) ?? null
  const leaderIsMe = leader?.userId === user?.id

  const hasSignal = streakWeeks > 0 || rank > 0 || (leader && !leaderIsMe)
  if (!hasSignal) return null

  // Headline prefers the personal streak; falls back to who's in form.
  const headline =
    streakWeeks > 0
      ? t('home.pulse.streakWeeks', { count: streakWeeks })
      : leader
        ? t('home.pulse.inForm', { name: leader.name })
        : t('home.pulse.title', { defaultValue: 'Power rankings' })

  const sub =
    rank > 0
      ? t('home.pulse.rank', { rank })
      : t('home.pulse.cta', { defaultValue: 'See the club rankings' })

  return (
    <Pressable
      onPress={() => router.push('/rankings')}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${sub}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: `${c.primary}12`,
          borderColor: c.borderSubtle,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: `${c.primary}24` }]}>
        <Icon name="bolt.fill" size={16} color="tint" />
      </View>
      <View style={styles.text}>
        <Text variant="subheadline" weight="semibold" numberOfLines={1}>
          {headline}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Icon name="chevron.right" size={16} color={c.textTertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: space['2xs'],
  },
})
