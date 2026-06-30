import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { StreaksLeaderboardEntry } from '@anstoss/shared'
import { ModalHeader } from '../src/components/ModalHeader'
import { Avatar, Icon, Text } from '../src/components/ui'
import { EmptyState } from '../src/components/EmptyState'
import { useStreaks } from '../src/hooks/useStreaks'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space, radius, hairline } from '../src/theme/tokens'

/**
 * Power Rankings — the club's free, verified League surface. Members ranked by
 * MOTM streak then attendance, all drawn from the club's own ops graph (no
 * scrape). The form leader doubles as the "in form" spotlight — the honest
 * stand-in for a Team of the Week, which would need per-position match ratings
 * we don't yet capture. Folds into Matches/Home in the later IA pass.
 */
export default function RankingsScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { data, loading, refreshing, refresh } = useStreaks()

  const board = data?.leaderboard ?? []
  const ranked = board.some((e) => e.motmWeeks > 0 || e.attendanceWeeks > 0)
  const leader = ranked ? board[0] : null

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('rankings.title', { defaultValue: 'Power Rankings' })}
        mode="back"
        onClose={() => router.back()}
      />
      {!loading && !ranked ? (
        <EmptyState
          icon="chart.bar"
          title={t('rankings.emptyTitle', { defaultValue: 'No rankings yet' })}
          description={t('rankings.emptyBody', {
            defaultValue:
              'Attendance and Player of the Match votes build the rankings. Check back once your team has played.',
          })}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={c.primary}
            />
          }
        >
          {leader ? (
            <View
              style={[
                styles.spotlight,
                {
                  backgroundColor: `${c.primary}14`,
                  borderColor: c.borderSubtle,
                },
              ]}
            >
              <Text
                variant="caption1"
                color="tertiary"
                tracking="wide"
                style={styles.spotlightEyebrow}
              >
                {t('rankings.spotlight', { defaultValue: 'IN FORM' }).toUpperCase()}
              </Text>
              <Avatar size="xl" src={leader.avatarUrl} fallbackText={leader.name} />
              <Text variant="title3" weight="bold" numberOfLines={1}>
                {leader.name}
              </Text>
              <View style={styles.spotlightStats}>
                <SpotlightStat
                  icon="trophy.fill"
                  value={leader.motmWeeks}
                  label={t('rankings.motmShort', { defaultValue: 'MOTM' })}
                  accent={c.primary}
                />
                <SpotlightStat
                  icon="calendar.fill"
                  value={leader.attendanceWeeks}
                  label={t('rankings.attendanceShort', { defaultValue: 'Attend.' })}
                  accent={c.primary}
                />
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderSubtle },
            ]}
          >
            {board.map((entry, index) => (
              <RankRow
                key={entry.userId}
                entry={entry}
                rank={index + 1}
                isMe={entry.userId === user?.id}
                isLast={index === board.length - 1}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function SpotlightStat({
  icon,
  value,
  label,
  accent,
}: {
  icon: string
  value: number
  label: string
  accent: string
}) {
  return (
    <View style={styles.spotlightStat}>
      <Icon name={icon} size={16} color={accent} />
      <Text variant="data" style={{ color: accent }} tabular>
        {value}
      </Text>
      <Text variant="caption2" color="tertiary">
        {label}
      </Text>
    </View>
  )
}

function RankRow({
  entry,
  rank,
  isMe,
  isLast,
}: {
  entry: StreaksLeaderboardEntry
  rank: number
  isMe: boolean
  isLast: boolean
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  // Podium emphasis for the top three; everyone else reads as quiet rank text.
  const rankColor = rank <= 3 ? c.primary : c.textTertiary

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomColor: c.borderSubtle, borderBottomWidth: hairline },
        isMe && { backgroundColor: `${c.primary}0F` },
      ]}
    >
      <Text variant="data" tabular style={[styles.rank, { color: rankColor }]}>
        {rank}
      </Text>
      <Avatar size="sm" src={entry.avatarUrl} fallbackText={entry.name} />
      <View style={styles.rowName}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {entry.name}
        </Text>
        {isMe ? (
          <Text variant="caption2" color="tint">
            {t('rankings.you', { defaultValue: 'You' })}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowStats}>
        <View style={styles.rowStat}>
          <Icon name="trophy.fill" size={13} color={c.textTertiary} />
          <Text variant="footnote" color="secondary" tabular>
            {entry.motmWeeks}
          </Text>
        </View>
        <View style={styles.rowStat}>
          <Icon name="calendar.fill" size={13} color={c.textTertiary} />
          <Text variant="footnote" color="secondary" tabular>
            {entry.attendanceWeeks}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.lg,
  },
  spotlight: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.xl,
    borderWidth: hairline,
  },
  spotlightEyebrow: {
    marginBottom: space.xs,
  },
  spotlightStats: {
    flexDirection: 'row',
    gap: space.xl,
    marginTop: space.sm,
  },
  spotlightStat: {
    alignItems: 'center',
    gap: space['2xs'],
  },
  list: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rank: {
    minWidth: 24,
    textAlign: 'center',
  },
  rowName: {
    flex: 1,
    gap: space['2xs'],
  },
  rowStats: {
    flexDirection: 'row',
    gap: space.md,
  },
  rowStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'],
  },
})
