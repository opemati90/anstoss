import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Linking,
  RefreshControl,
} from 'react-native'
import type { ImportedFixture } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Icon, Screen, Text } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { card, elevation, hairline, space, radius } from '../src/theme/tokens'

export default function MatchDetailScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess } = useAuth()
  const c = useClubColors()
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
      <Screen header={<ModalHeader />} scroll={false} padded={false}>
        <View style={styles.emptyContainer} />
      </Screen>
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
    <Screen
      header={<ModalHeader title={fixture.competition} />}
      scroll={false}
      padded={false}
    >
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
              { backgroundColor: c.surface, borderColor: c.border },
              fixture.status === 'live' && { backgroundColor: `${c.error}18` },
              isFinished && { backgroundColor: `${c.success}18` },
            ]}
          >
            <Text
              variant="caption2"
              tracking="wide"
              color={
                fixture.status === 'live'
                  ? c.error
                  : isFinished
                    ? c.success
                    : 'secondary'
              }
            >
              {t(`fussball.status.${fixture.status}`)}
            </Text>
          </View>
          {fixture.season && (
            <Text variant="caption2" color="tertiary">{fixture.season}</Text>
          )}
        </View>

        <Text variant="body" color="primary">{dateStr}</Text>
        <Text variant="title2" color="primary" tabular style={styles.timeText}>{timeStr}</Text>

        {/* Scoreboard */}
        <View style={[styles.scoreboard, { backgroundColor: c.surface, borderColor: c.border, ...elevation.card }]}>
          <View style={styles.teamColumn}>
            {fixture.homeLogo ? (
              <Image source={{ uri: fixture.homeLogo }} style={styles.teamLogoLarge} />
            ) : (
              <View style={[styles.teamLogoLargePlaceholder, { backgroundColor: c.border }]} />
            )}
            <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={2} style={styles.teamNameCenter}>
              {fixture.homeTeam}
            </Text>
          </View>

          <View style={styles.scoreColumn}>
            {hasResult ? (
              <Text variant="title1" color="primary" tabular>
                {fixture.resultHome} : {fixture.resultAway}
              </Text>
            ) : (
              <Text variant="title3" color="tertiary">vs</Text>
            )}
          </View>

          <View style={styles.teamColumn}>
            {fixture.awayLogo ? (
              <Image source={{ uri: fixture.awayLogo }} style={styles.teamLogoLarge} />
            ) : (
              <View style={[styles.teamLogoLargePlaceholder, { backgroundColor: c.border }]} />
            )}
            <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={2} style={styles.teamNameCenter}>
              {fixture.awayTeam}
            </Text>
          </View>
        </View>

        {/* Venue */}
        {(fixture.venueName || fixture.pitchAddress) && (
          <Pressable
            style={[styles.venueCard, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={fixture.pitchAddress ? openMaps : undefined}
            disabled={!fixture.pitchAddress}
            accessibilityRole="button"
            accessibilityLabel={t('matches.openMaps')}
          >
            <View style={[styles.venueIcon, { backgroundColor: c.background }]}>
              <Icon name="mappin.circle.fill" size="md" color={c.clubPrimary} />
            </View>
            <View style={styles.venueText}>
              {fixture.venueName && (
                <Text variant="subheadline" weight="semibold" color="primary">{fixture.venueName}</Text>
              )}
              {fixture.pitchAddress && (
                <Text variant="footnote" color="secondary">{fixture.pitchAddress}</Text>
              )}
            </View>
            {fixture.pitchAddress && (
              <Icon name="arrow.triangle.turn.up.right.diamond.fill" size="md" color={c.clubPrimary} />
            )}
          </Pressable>
        )}

        {/* Coach Overlay */}
        {isCoach && overlay && (
          <View style={[styles.overlaySection, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text variant="headline" color="primary">{t('matches.coachDetails')}</Text>

            {overlay.arrivalTime && (
              <View style={styles.overlayRow}>
                <Icon name="clock.fill" size="sm" color="secondary" />
                <Text variant="footnote" color="secondary" style={styles.overlayLabel}>{t('matches.arrivalTime')}</Text>
                <Text variant="footnote" weight="semibold" color="primary" tabular>
                  {new Intl.DateTimeFormat(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(overlay.arrivalTime))}
                </Text>
              </View>
            )}

            {overlay.meetingPoint && (
              <View style={styles.overlayRow}>
                <Icon name="flag.fill" size="sm" color="secondary" />
                <Text variant="footnote" color="secondary" style={styles.overlayLabel}>{t('matches.meetingPoint')}</Text>
                <Text variant="footnote" weight="semibold" color="primary">{overlay.meetingPoint}</Text>
              </View>
            )}

            {overlay.kitColor && (
              <View style={styles.overlayRow}>
                <View style={[styles.kitSwatch, { backgroundColor: overlay.kitColor, borderColor: c.border }]} />
                <Text variant="footnote" color="secondary" style={styles.overlayLabel}>{t('matches.kitColor')}</Text>
                <Text variant="footnote" weight="semibold" color="primary">{overlay.kitColor}</Text>
              </View>
            )}

            {overlay.travelNotes && (
              <View style={styles.overlayRow}>
                <Icon name="car.fill" size="sm" color="secondary" />
                <Text variant="footnote" color="primary" style={{ flex: 1 }}>{overlay.travelNotes}</Text>
              </View>
            )}
          </View>
        )}

        {/* League table link */}
        {hasTable && (
          <Pressable
            style={[styles.tableLink, { borderColor: c.clubPrimary }]}
            onPress={() =>
              router.push({
                pathname: '/league-table',
                params: { teamId: fixture.teamId },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('matches.viewTable')}
          >
            <Icon name="chart.bar.fill" size="md" color={c.clubPrimary} />
            <Text variant="subheadline" weight="semibold" color={c.clubPrimary}>
              {t('matches.viewTable')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  emptyContainer: { flex: 1 },
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
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  timeText: {
    marginBottom: space.lg,
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: card.heroRadius,
    borderCurve: 'continuous',
    borderWidth: hairline,
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
    borderRadius: radius.lg,
  },
  teamLogoLargePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
  },
  teamNameCenter: {
    textAlign: 'center',
  },
  scoreColumn: {
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  venueIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueText: { flex: 1, gap: space['2xs'] },
  overlaySection: {
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  overlayLabel: {
    flex: 1,
  },
  kitSwatch: {
    width: 16,
    height: 16,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  tableLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    marginBottom: space.md,
  },
})
