import { useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, SectionList, Pressable, RefreshControl, Image } from 'react-native'
import type { ImportedFixture } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Text, Icon } from '../src/components/ui'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fontSize, space, radius, fonts, hairline, elevation } from '../src/theme/tokens'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'

type FormResult = 'W' | 'D' | 'L'

export default function TeamMatchesScreen() {
  const { t } = useTranslation()
  const { activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const insets = useSafeAreaInsetsSafe()

  const [upcoming, setUpcoming] = useState<ImportedFixture[]>([])
  const [recent, setRecent] = useState<ImportedFixture[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchFixtures = useCallback(async () => {
    if (!activeTeamId) {
      setLoading(false)
      return
    }
    try {
      const [upcomingFixtures, recentFixtures] = await Promise.all([
        api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=upcoming&limit=20`),
        api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=recent&limit=10`),
      ])
      setUpcoming(upcomingFixtures || [])
      setRecent(recentFixtures || [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeTeamId])

  useEffect(() => {
    void fetchFixtures()
  }, [fetchFixtures])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchFixtures()
    } finally {
      setRefreshing(false)
    }
  }

  const teamLabel = activeTeamAccess?.team.displayName || ''

  const formStreak: FormResult[] = recent
    .filter((f) => f.status === 'finished' && f.resultHome != null && f.resultAway != null)
    .slice(0, 5)
    .map((f) => {
      const isHome = f.homeTeam.toLowerCase().includes(teamLabel.toLowerCase().slice(0, 6))
      const ownGoals = isHome ? f.resultHome! : f.resultAway!
      const oppGoals = isHome ? f.resultAway! : f.resultHome!
      if (ownGoals > oppGoals) return 'W'
      if (ownGoals < oppGoals) return 'L'
      return 'D'
    })

  const sections = [
    ...(upcoming.length > 0 ? [{ title: t('matches.upcoming'), data: upcoming }] : []),
    ...(recent.length > 0 ? [{ title: t('matches.recent'), data: recent }] : []),
  ]

  const renderFixture = ({ item }: { item: ImportedFixture }) => {
    const kickoff = new Date(item.kickoffAt)
    const dateStr = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(kickoff)
    const timeStr = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(kickoff)
    const isFinished = item.status === 'finished'
    const hasResult = item.resultHome != null && item.resultAway != null

    return (
      <Pressable
        style={[
          styles.fixtureCard,
          {
            backgroundColor: c.surface,
            borderColor: c.borderDefault,
          },
        ]}
        onPress={() =>
          router.push({
            pathname: '/match-detail',
            params: { fixtureId: item.id, teamId: item.teamId },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${item.homeTeam} vs ${item.awayTeam}`}
      >
        <View style={styles.fixtureDate}>
          <Text style={[styles.fixtureDateText, { color: c.textSecondary }]}>{dateStr}</Text>
          <Text style={[styles.fixtureTimeText, { color: c.textPrimary }]}>{timeStr}</Text>
        </View>

        <View style={styles.fixtureBody}>
          <View style={styles.teamRow}>
            {item.homeLogo ? (
              <Image source={{ uri: item.homeLogo }} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: c.borderDefault }]} />
            )}
            <Text style={[styles.teamName, { color: c.textPrimary }]} numberOfLines={1}>
              {item.homeTeam}
            </Text>
            {hasResult && (
              <Text style={[styles.score, { color: isFinished ? c.textPrimary : c.textTertiary }]}>
                {item.resultHome}
              </Text>
            )}
          </View>
          <View style={styles.teamRow}>
            {item.awayLogo ? (
              <Image source={{ uri: item.awayLogo }} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: c.borderDefault }]} />
            )}
            <Text style={[styles.teamName, { color: c.textPrimary }]} numberOfLines={1}>
              {item.awayTeam}
            </Text>
            {hasResult && (
              <Text style={[styles.score, { color: isFinished ? c.textPrimary : c.textTertiary }]}>
                {item.resultAway}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.fixtureMeta}>
          <Text style={[styles.competitionText, { color: c.textTertiary }]} numberOfLines={1}>
            {item.competition}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: c.background },
              item.status === 'live' && { backgroundColor: `${c.error}18` },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: c.textSecondary },
                item.status === 'live' ? { color: c.error } : {},
              ]}
            >
              {t(`fussball.status.${item.status}`)}
            </Text>
          </View>
        </View>
      </Pressable>
    )
  }

  const hasNoTeam = !loading && !activeTeamId
  const hasNoData = !loading && !hasNoTeam && upcoming.length === 0 && recent.length === 0

  const retry = () => {
    setLoading(true)
    void fetchFixtures()
  }

  return (
    <Screen header={<ModalHeader title={t('matches.title')} />} padded={false}>
      {formStreak.length > 0 && (
        <View style={styles.formRow}>
          <Text style={[styles.formLabel, { color: c.textSecondary }]}>{t('matches.form')}</Text>
          <View style={styles.formBadges}>
            {formStreak.map((result, i) => (
              <View
                key={i}
                style={[
                  styles.formBadge,
                  {
                    backgroundColor:
                      result === 'W' ? c.success : result === 'L' ? c.error : c.warning,
                  },
                ]}
              >
                <Text style={[styles.formBadgeText, { color: c.textInverse }]}>{result}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <ErrorBoundary
        onRetry={retry}
        fallbackTitleKey="states.team_matches.error.title"
        fallbackBodyKey="states.team_matches.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={loading}
          skeleton={<DashboardSkeleton />}
          testID="team-matches-loading-boundary"
        >
          {error ? (
            <ErrorState
              message={t('states.team_matches.error.title')}
              onRetry={retry}
              retryLabel={t('states.common.retry')}
            />
          ) : hasNoTeam ? (
            <View style={styles.empty}>
              <EmptyState
                icon="figure.soccer"
                title={t('states.team_matches.noTeam.title', { defaultValue: 'No team selected' })}
                description={t('states.team_matches.noTeam.body', { defaultValue: 'Join or select a team to see fixtures.' })}
              />
            </View>
          ) : hasNoData ? (
            <View style={styles.empty}>
              <EmptyState
                icon="figure.soccer"
                title={t('states.team_matches.empty.title')}
                description={t('states.team_matches.empty.body')}
              />
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              renderItem={renderFixture}
              renderSectionHeader={({ section }) => (
                <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>{section.title}</Text>
              )}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              stickySectionHeadersEnabled={false}
            />
          )}
        </LoadingBoundary>
      </ErrorBoundary>

      {recent.some((f) => f.tableSnapshot && f.tableSnapshot.length > 0) && (
        <Pressable
          style={[styles.tableFab, { backgroundColor: c.primary, bottom: space.xl + insets.bottom }]}
          onPress={() =>
            router.push({
              pathname: '/league-table',
              params: { teamId: activeTeamId! },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('matches.leagueTable')}
        >
          <Icon name="chart.bar" size="lg" color={c.textInverse} />
        </Pressable>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.md, paddingBottom: space.md },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  fixtureCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  fixtureDate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fixtureDateText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  fixtureTimeText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
  },
  fixtureBody: { gap: space.sm },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  teamLogo: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.sm,
  },
  teamLogoPlaceholder: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.sm,
  },
  teamName: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  score: {
    fontSize: fontSize.lg,
    fontFamily: fonts.data,
    minWidth: space.lg,
    textAlign: 'center',
  },
  fixtureMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  competitionText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  statusBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  formLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  formBadges: {
    flexDirection: 'row',
    gap: space.xs,
  },
  formBadge: {
    width: space.xl,
    height: space.xl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.heading,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  tableFab: {
    position: 'absolute',
    bottom: space.xl,
    right: space.md,
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.fab,
  },
})
