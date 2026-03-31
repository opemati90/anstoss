import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ImportedFixture } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fonts, neutralColors, semanticColors, fontSize, fontWeight, space, radius } from '../src/theme/tokens'

export default function MatchDetailScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const { fixtureId, teamId } = useLocalSearchParams<{ fixtureId: string; teamId: string }>()
  const locale = getAppLocale(getAppLanguage())

  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const isCoach =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchFixture = useCallback(async () => {
    if (!teamId) return
    try {
      const fixtures = await api<ImportedFixture[]>(
        `/teams/${teamId}/fixtures?scope=all&limit=50`,
      )
      const found = fixtures?.find((f) => f.id === fixtureId)
      if (found) setFixture(found)
    } catch {
      // stale-while-revalidate
    }
  }, [teamId, fixtureId])

  useEffect(() => {
    void fetchFixture()
  }, [fetchFixture])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchFixture()
    } finally {
      setRefreshing(false)
    }
  }

  if (!fixture) {
    return (
      <View style={styles.container}>
        <ModalHeader />
      </View>
    )
  }

  const kickoff = new Date(fixture.kickoffAt)
  const dateStr = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(kickoff)
  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(kickoff)
  const isFinished = fixture.status === 'finished'
  const hasResult = fixture.resultHome != null && fixture.resultAway != null
  const hasTable = fixture.tableSnapshot && (fixture.tableSnapshot as unknown[]).length > 0
  const overlay = fixture.overlay

  const openMaps = () => {
    if (!fixture.pitchAddress) return
    const url = `https://maps.apple.com/?q=${encodeURIComponent(fixture.pitchAddress)}`
    Linking.openURL(url)
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={fixture.competition} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Status + Date */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusBadge,
              fixture.status === 'live' && { backgroundColor: `${semanticColors.error}18` },
              isFinished && { backgroundColor: `${semanticColors.success}18` },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                fixture.status === 'live' && { color: semanticColors.error },
                isFinished && { color: semanticColors.success },
              ]}
            >
              {t(`fussball.status.${fixture.status}`)}
            </Text>
          </View>
          {fixture.season && (
            <Text style={styles.seasonText}>{fixture.season}</Text>
          )}
        </View>

        <Text style={styles.dateText}>{dateStr}</Text>
        <Text style={styles.timeText}>{timeStr}</Text>

        {/* Scoreboard */}
        <View style={styles.scoreboard}>
          <View style={styles.teamColumn}>
            {fixture.homeLogo ? (
              <Image source={{ uri: fixture.homeLogo }} style={styles.teamLogoLarge} />
            ) : (
              <View style={[styles.teamLogoLargePlaceholder, { backgroundColor: neutralColors.border }]} />
            )}
            <Text style={styles.teamNameLarge} numberOfLines={2}>
              {fixture.homeTeam}
            </Text>
          </View>

          <View style={styles.scoreColumn}>
            {hasResult ? (
              <Text style={styles.scoreLarge}>
                {fixture.resultHome} : {fixture.resultAway}
              </Text>
            ) : (
              <Text style={styles.vsText}>vs</Text>
            )}
          </View>

          <View style={styles.teamColumn}>
            {fixture.awayLogo ? (
              <Image source={{ uri: fixture.awayLogo }} style={styles.teamLogoLarge} />
            ) : (
              <View style={[styles.teamLogoLargePlaceholder, { backgroundColor: neutralColors.border }]} />
            )}
            <Text style={styles.teamNameLarge} numberOfLines={2}>
              {fixture.awayTeam}
            </Text>
          </View>
        </View>

        {/* Venue */}
        {(fixture.venueName || fixture.pitchAddress) && (
          <TouchableOpacity
            style={styles.venueCard}
            onPress={fixture.pitchAddress ? openMaps : undefined}
            disabled={!fixture.pitchAddress}
            accessibilityRole="button"
            accessibilityLabel={t('matches.openMaps')}
          >
            <View style={styles.venueIcon}>
              <Ionicons name="location" size={20} color={theme.clubPrimary} />
            </View>
            <View style={styles.venueText}>
              {fixture.venueName && (
                <Text style={styles.venueName}>{fixture.venueName}</Text>
              )}
              {fixture.pitchAddress && (
                <Text style={styles.venueAddress}>{fixture.pitchAddress}</Text>
              )}
            </View>
            {fixture.pitchAddress && (
              <Ionicons name="navigate-outline" size={18} color={theme.clubPrimary} />
            )}
          </TouchableOpacity>
        )}

        {/* Coach Overlay */}
        {isCoach && overlay && (
          <View style={styles.overlaySection}>
            <Text style={styles.overlaySectionTitle}>{t('matches.coachDetails')}</Text>

            {overlay.arrivalTime && (
              <View style={styles.overlayRow}>
                <Ionicons name="time-outline" size={16} color={neutralColors.textSecondary} />
                <Text style={styles.overlayLabel}>{t('matches.arrivalTime')}</Text>
                <Text style={styles.overlayValue}>
                  {new Intl.DateTimeFormat(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(overlay.arrivalTime))}
                </Text>
              </View>
            )}

            {overlay.meetingPoint && (
              <View style={styles.overlayRow}>
                <Ionicons name="flag-outline" size={16} color={neutralColors.textSecondary} />
                <Text style={styles.overlayLabel}>{t('matches.meetingPoint')}</Text>
                <Text style={styles.overlayValue}>{overlay.meetingPoint}</Text>
              </View>
            )}

            {overlay.kitColor && (
              <View style={styles.overlayRow}>
                <View style={[styles.kitSwatch, { backgroundColor: overlay.kitColor }]} />
                <Text style={styles.overlayLabel}>{t('matches.kitColor')}</Text>
                <Text style={styles.overlayValue}>{overlay.kitColor}</Text>
              </View>
            )}

            {overlay.travelNotes && (
              <View style={styles.overlayRow}>
                <Ionicons name="car-outline" size={16} color={neutralColors.textSecondary} />
                <Text style={[styles.overlayValue, { flex: 1 }]}>{overlay.travelNotes}</Text>
              </View>
            )}
          </View>
        )}

        {/* League table link */}
        {hasTable && (
          <TouchableOpacity
            style={[styles.tableLink, { borderColor: theme.clubPrimary }]}
            onPress={() =>
              router.push({
                pathname: '/league-table',
                params: { teamId: fixture.teamId },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('matches.viewTable')}
          >
            <Ionicons name="podium-outline" size={18} color={theme.clubPrimary} />
            <Text style={[styles.tableLinkText, { color: theme.clubPrimary }]}>
              {t('matches.viewTable')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: space.md, paddingBottom: space['2xl'] },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  statusBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seasonText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
  },
  dateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  timeText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
    marginBottom: space.lg,
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    marginBottom: space.md,
    gap: space.md,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
  },
  teamLogoLarge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  teamLogoLargePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  teamNameLarge: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  scoreColumn: {
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  scoreLarge: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.data,
  },
  vsText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  venueIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueText: { flex: 1, gap: space['2xs'] },
  venueName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  venueAddress: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  overlaySection: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  overlaySectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    marginBottom: space.xs,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  overlayLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    flex: 1,
  },
  overlayValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  kitSwatch: {
    width: 16,
    height: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  tableLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: space.md,
  },
  tableLinkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
  },
})
