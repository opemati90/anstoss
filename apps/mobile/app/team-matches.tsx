import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ImportedFixture } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { IllustratedEmptyState } from '../src/components/IllustratedEmptyState'
import { illustrations } from '../src/illustrations'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { neutralColors, semanticColors, fontSize, fontWeight, space, radius } from '../src/theme/tokens'

type FormResult = 'W' | 'D' | 'L'

export default function TeamMatchesScreen() {
  const { t } = useTranslation()
  const { activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [upcoming, setUpcoming] = useState<ImportedFixture[]>([])
  const [recent, setRecent] = useState<ImportedFixture[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchFixtures = useCallback(async () => {
    if (!activeTeamId) return
    const [upRes, recentRes] = await Promise.allSettled([
      api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=upcoming&limit=20`),
      api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=recent&limit=10`),
    ])
    if (upRes.status === 'fulfilled') setUpcoming(upRes.value || [])
    if (recentRes.status === 'fulfilled') setRecent(recentRes.value || [])
    setLoading(false)
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
    ...(upcoming.length > 0
      ? [{ title: t('matches.upcoming'), data: upcoming }]
      : []),
    ...(recent.length > 0
      ? [{ title: t('matches.recent'), data: recent }]
      : []),
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
      <TouchableOpacity
        style={styles.fixtureCard}
        onPress={() =>
          router.push({
            pathname: '/match-detail',
            params: { fixtureId: item.id, teamId: item.teamId },
          })
        }
      >
        <View style={styles.fixtureDate}>
          <Text style={styles.fixtureDateText}>{dateStr}</Text>
          <Text style={styles.fixtureTimeText}>{timeStr}</Text>
        </View>

        <View style={styles.fixtureBody}>
          <View style={styles.teamRow}>
            {item.homeLogo ? (
              <Image source={{ uri: item.homeLogo }} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: neutralColors.border }]} />
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {item.homeTeam}
            </Text>
            {hasResult && (
              <Text style={[styles.score, isFinished && styles.scoreFinal]}>
                {item.resultHome}
              </Text>
            )}
          </View>
          <View style={styles.teamRow}>
            {item.awayLogo ? (
              <Image source={{ uri: item.awayLogo }} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: neutralColors.border }]} />
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {item.awayTeam}
            </Text>
            {hasResult && (
              <Text style={[styles.score, isFinished && styles.scoreFinal]}>
                {item.resultAway}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.fixtureMeta}>
          <Text style={styles.competitionText} numberOfLines={1}>
            {item.competition}
          </Text>
          <View
            style={[
              styles.statusBadge,
              item.status === 'live' && { backgroundColor: `${semanticColors.error}18` },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                item.status === 'live' && { color: semanticColors.error },
              ]}
            >
              {t(`fussball.status.${item.status}`)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const hasNoData = !loading && upcoming.length === 0 && recent.length === 0

  return (
    <View style={styles.container}>
      <ModalHeader title={t('matches.title')} />

      {formStreak.length > 0 && (
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>{t('matches.form')}</Text>
          <View style={styles.formBadges}>
            {formStreak.map((result, i) => (
              <View
                key={i}
                style={[
                  styles.formBadge,
                  {
                    backgroundColor:
                      result === 'W'
                        ? semanticColors.success
                        : result === 'L'
                          ? semanticColors.error
                          : semanticColors.warning,
                  },
                ]}
              >
                <Text style={styles.formBadgeText}>{result}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {hasNoData ? (
        <View style={styles.empty}>
          <IllustratedEmptyState
            illustration={illustrations.emptyEvents}
            title={t('fussball.noFixturesTitle')}
            description={t('fussball.noFixturesBody')}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderFixture}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      {recent.some((f) => f.tableSnapshot && f.tableSnapshot.length > 0) && (
        <TouchableOpacity
          style={[styles.tableFab, { backgroundColor: theme.clubPrimary }]}
          onPress={() =>
            router.push({
              pathname: '/league-table',
              params: { teamId: activeTeamId! },
            })
          }
        >
          <Ionicons name="podium-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  list: { paddingHorizontal: space.md, paddingBottom: 100 },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  fixtureCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
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
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
  },
  fixtureTimeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  fixtureBody: { gap: 6 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  teamLogo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  teamLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  teamName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
  score: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    minWidth: 24,
    textAlign: 'center',
  },
  scoreFinal: {
    color: neutralColors.textPrimary,
  },
  fixtureMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  competitionText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: neutralColors.textTertiary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: neutralColors.background,
  },
  statusText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
  },
  formBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  formBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#FFF',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  tableFab: {
    position: 'absolute',
    bottom: 32,
    right: space.md,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
})
