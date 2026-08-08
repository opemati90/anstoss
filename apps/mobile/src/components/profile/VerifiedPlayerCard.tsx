import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { StreaksMe } from '@anstoss/shared'
import { Avatar, Icon, StatusPill, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { space, radius, hairline } from '../../theme/tokens'

export type VerifiedPlayerCardProps = {
  name: string
  avatarUrl?: string | null
  /** Role / position / club line under the name. */
  subtitle?: string | null
  streaks: StreaksMe
  /** 1-based leaderboard position, or null when unranked. */
  rank?: number | null
  /** Size of the leaderboard the rank is drawn from. */
  totalRanked?: number
  /** Whether the data is club-verified (drives the seal pill). */
  isVerified?: boolean
}

/**
 * The verified gamified player card — the Player persona's daily "aha".
 *
 * Every figure here is backed by the club's own operational graph (attendance
 * RSVPs, MOTM poll wins), not a public scrape, so the card reads as truth. Pure
 * presentational: the screen supplies data via `useStreaks`. Club-adaptive
 * accent, DM Sans + Geist Mono, restrained — energetic but unmistakably ours,
 * light + dark.
 */
export function VerifiedPlayerCard({
  name,
  avatarUrl,
  subtitle,
  streaks,
  rank,
  totalRanked,
  isVerified = false,
}: VerifiedPlayerCardProps) {
  const c = useClubColors()
  const { t } = useTranslation()

  const tint = `${c.primary}14`
  const tintStrong = `${c.primary}24`

  return (
    <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.borderSubtle }]}>
      {/* Accent header — club-tinted band carrying identity. */}
      <View style={[styles.header, { backgroundColor: tint }]}>
        <Avatar size="lg" src={avatarUrl} fallbackText={name} />
        <View style={styles.identity}>
          <Text variant="title3" weight="bold" numberOfLines={1}>
            {name}
          </Text>
          {subtitle ? (
            <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          {isVerified ? (
            <StatusPill
              label={t('verifiedCard.verified')}
              tone="success"
              icon="checkmark.seal.fill"
              style={styles.verifiedPill}
            />
          ) : null}
        </View>
      </View>

      {/* Verified streak tiles. */}
      <View style={styles.tiles}>
        <StreakTile
          icon="calendar.fill"
          label={t('verifiedCard.attendanceStreak')}
          value={streaks.attendanceWeeks}
          longest={streaks.attendanceLongest}
          tintBg={tintStrong}
          accent={c.primary}
        />
        <View style={[styles.tileDivider, { backgroundColor: c.borderSubtle }]} />
        <StreakTile
          icon="trophy.fill"
          label={t('verifiedCard.motmStreak')}
          value={streaks.motmWeeks}
          longest={streaks.motmLongest}
          tintBg={tintStrong}
          accent={c.primary}
        />
      </View>

      {/* Footer — leaderboard standing. */}
      {rank && totalRanked ? (
        <View style={[styles.footer, { borderTopColor: c.borderSubtle }]}>
          <Icon name="chart.bar.fill" size={16} color={c.textTertiary} />
          <Text variant="footnote" color="secondary">
            {t('verifiedCard.rank', { rank, total: totalRanked })}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function StreakTile({
  icon,
  label,
  value,
  longest,
  tintBg,
  accent,
}: {
  icon: string
  label: string
  value: number
  longest: number
  tintBg: string
  accent: string
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: tintBg }]}>
        <Icon name={icon} size={18} color={accent} />
      </View>
      <Text variant="caption1" color="tertiary" tracking="wide" style={styles.tileLabel}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.tileValueRow}>
        <Text variant="dataLarge" style={{ color: accent }} tabular>
          {value}
        </Text>
        <Text variant="caption1" color="secondary" style={styles.tileUnit}>
          {t('verifiedCard.weeksUnit')}
        </Text>
      </View>
      <Text variant="caption2" color="tertiary">
        {t('verifiedCard.longest', { count: longest })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  identity: {
    flex: 1,
    gap: space['2xs'],
  },
  subtitle: {
    marginTop: space['2xs'],
  },
  verifiedPill: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
  },
  tiles: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
  tileDivider: {
    width: hairline,
    marginVertical: space.xs,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    textAlign: 'center',
  },
  tileValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space['2xs'],
  },
  tileUnit: {
    marginBottom: space['2xs'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: hairline,
  },
})
