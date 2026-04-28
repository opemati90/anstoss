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
import type { ImportedFixture, TableSnapshotRow } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Icon, Screen, Text } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { card, elevation, hairline, space, radius } from '../src/theme/tokens'

type DetailTab = 'info' | 'news' | 'table' | 'facts'

export default function MatchDetailScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const { fixtureId, teamId } = useLocalSearchParams<{ fixtureId: string; teamId: string }>()
  const locale = getAppLocale(getAppLanguage())

  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('info')

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
        {/* Editorial header — competition · date · status */}
        <View style={styles.eyebrowRow}>
          <Text variant="caption2" tracking="wide" color="secondary">
            {[fixture.competition, dateStr].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.statusDot}>
            {fixture.status === 'live' ? (
              <View style={[styles.dot, { backgroundColor: c.error }]} />
            ) : isFinished ? (
              <View style={[styles.dot, { backgroundColor: c.success }]} />
            ) : null}
            <Text variant="caption2" color={fixture.status === 'live' ? c.error : 'tertiary'}>
              {t(`fussball.status.${fixture.status}`)}
            </Text>
          </View>
        </View>

        {/* Hero — kickoff time + crests + vs */}
        <Text variant="title3" color="primary" tabular style={styles.heroKickoff}>
          {timeStr}
        </Text>
        <View style={styles.heroCrests}>
          <View style={styles.heroSide}>
            {fixture.homeLogo ? (
              <Image source={{ uri: fixture.homeLogo }} style={styles.crest} />
            ) : (
              <View style={[styles.crestPlaceholder, { backgroundColor: c.surface, borderColor: c.borderDefault }]} />
            )}
            <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={2} style={styles.heroTeamName}>
              {fixture.homeTeam}
            </Text>
          </View>
          <View style={styles.heroCenter}>
            {hasResult ? (
              <Text variant="title1" color="primary" tabular weight="semibold">
                {fixture.resultHome} <Text variant="title1" color="tertiary">:</Text> {fixture.resultAway}
              </Text>
            ) : (
              <Text variant="title3" color="tertiary">vs</Text>
            )}
          </View>
          <View style={styles.heroSide}>
            {fixture.awayLogo ? (
              <Image source={{ uri: fixture.awayLogo }} style={styles.crest} />
            ) : (
              <View style={[styles.crestPlaceholder, { backgroundColor: c.surface, borderColor: c.borderDefault }]} />
            )}
            <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={2} style={styles.heroTeamName}>
              {fixture.awayTeam}
            </Text>
          </View>
        </View>
        {fixture.venueName ? (
          <Text variant="footnote" color="secondary" style={styles.heroVenue}>
            {[fixture.venueName, fixture.pitchAddress].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        {/* Tab strip */}
        <View style={[styles.tabStrip, { borderColor: c.borderDefault }]}>
          {(['info', 'news', 'table', 'facts'] as const).map((key) => {
            const isActive = activeTab === key
            return (
              <Pressable
                key={key}
                onPress={() => setActiveTab(key)}
                accessibilityRole="tab"
                accessibilityLabel={t(`matches.tab.${key}`)}
                accessibilityState={{ selected: isActive }}
                style={[
                  styles.tab,
                  isActive && { borderBottomColor: c.primary },
                ]}
              >
                <Text
                  variant="footnote"
                  weight={isActive ? 'semibold' : 'regular'}
                  color={isActive ? 'primary' : 'secondary'}
                >
                  {t(`matches.tab.${key}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Info tab — editorial rows */}
        {activeTab === 'info' && (
          <View style={styles.infoBlock}>
            <InfoRow label={t('matches.tab.kickoffLabel')} value={dateStr} />
            <InfoDivider />
            <InfoRow label={t('matches.tab.timeLabel')} value={timeStr} valueMono />
            {fixture.venueName ? (
              <>
                <InfoDivider />
                <InfoRow
                  label={t('matches.tab.venueLabel')}
                  value={fixture.venueName}
                  onPress={fixture.pitchAddress ? openMaps : undefined}
                  hint={fixture.pitchAddress ?? undefined}
                />
              </>
            ) : null}
            {fixture.competition ? (
              <>
                <InfoDivider />
                <InfoRow label={t('matches.tab.leagueLabel')} value={fixture.competition} />
              </>
            ) : null}
            {isCoach && overlay?.arrivalTime ? (
              <>
                <InfoDivider />
                <InfoRow
                  label={t('matches.arrivalTime')}
                  value={new Intl.DateTimeFormat(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(overlay.arrivalTime))}
                  valueMono
                />
              </>
            ) : null}
            {isCoach && overlay?.meetingPoint ? (
              <>
                <InfoDivider />
                <InfoRow label={t('matches.meetingPoint')} value={overlay.meetingPoint} />
              </>
            ) : null}
            {isCoach && overlay?.kitColor ? (
              <>
                <InfoDivider />
                <InfoRow label={t('matches.kitColor')} value={overlay.kitColor} />
              </>
            ) : null}
          </View>
        )}

        {/* Table tab — inlined standings snippet (5 rows centred on fixture team) */}
        {activeTab === 'table' && (
          hasTable ? (
            <View style={styles.tableBlock}>
              <View style={[styles.tableHeader, { borderBottomColor: c.borderDefault }]}>
                <Text variant="caption2" color="tertiary" style={styles.tablePlace}>#</Text>
                <Text variant="caption2" color="tertiary" style={styles.tableTeam}>
                  {t('matches.colTeam')}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum} tabular>
                  {t('matches.colP')}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum} tabular>
                  {t('matches.colGD')}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum} tabular>
                  {t('matches.colPts')}
                </Text>
              </View>
              {windowAroundFixture(fixture.tableSnapshot as TableSnapshotRow[], fixture.homeTeam, fixture.awayTeam).map((row, i, arr) => {
                const mine =
                  row.team === fixture.homeTeam || row.team === fixture.awayTeam
                return (
                  <View key={`${row.place}-${row.team}`}>
                    <View style={[styles.tableRow, mine && { backgroundColor: c.primary50 }]}>
                      <Text variant="footnote" color={mine ? c.primary : 'secondary'} weight={mine ? 'semibold' : 'regular'} style={styles.tablePlace} tabular>
                        {row.place}
                      </Text>
                      <Text variant="footnote" color={mine ? c.primary : 'primary'} weight={mine ? 'semibold' : 'regular'} numberOfLines={1} style={styles.tableTeam}>
                        {row.team}
                      </Text>
                      <Text variant="footnote" color="secondary" style={styles.tableNum} tabular>{row.games}</Text>
                      <Text variant="footnote" color="secondary" style={styles.tableNum} tabular>
                        {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
                      </Text>
                      <Text variant="footnote" weight="semibold" color={mine ? c.primary : 'primary'} style={styles.tableNum} tabular>
                        {row.points}
                      </Text>
                    </View>
                    {i < arr.length - 1 ? (
                      <View style={[styles.hairline, { backgroundColor: c.borderDefault }]} />
                    ) : null}
                  </View>
                )
              })}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/league-table',
                    params: { teamId: fixture.teamId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('matches.viewTable')}
                style={styles.tableViewAll}
              >
                <Text variant="footnote" weight="semibold" color={c.primary}>
                  {t('matches.viewTable')} →
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.infoBlock}>
              <Text variant="footnote" color="secondary">
                {t('matches.tab.tableEmpty')}
              </Text>
            </View>
          )
        )}

        {/* News tab — placeholder editorial */}
        {activeTab === 'news' && (
          <View style={styles.infoBlock}>
            <Text variant="callout" color="primary" weight="semibold">
              {t('matches.tab.newsTitle')}
            </Text>
            <Text variant="footnote" color="secondary" style={styles.tabEmptyBody}>
              {t('matches.tab.newsEmpty')}
            </Text>
          </View>
        )}

        {/* Facts tab — placeholder editorial */}
        {activeTab === 'facts' && (
          <View style={styles.infoBlock}>
            <Text variant="callout" color="primary" weight="semibold">
              {t('matches.tab.factsTitle')}
            </Text>
            <Text variant="footnote" color="secondary" style={styles.tabEmptyBody}>
              {t('matches.tab.factsEmpty')}
            </Text>
          </View>
        )}

      </ScrollView>
    </Screen>
  )
}

function InfoRow({
  label,
  value,
  valueMono,
  hint,
  onPress,
}: {
  label: string
  value: string
  valueMono?: boolean
  hint?: string
  onPress?: () => void
}) {
  const c = useClubColors()
  const Wrap: any = onPress ? Pressable : View
  return (
    <Wrap
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label} ${value}` : undefined}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        styles.infoRow,
        pressed && onPress ? { opacity: 0.55 } : null,
      ]}
    >
      <Text variant="footnote" color="secondary" style={styles.infoLabel}>
        {label}
      </Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        <Text
          variant="footnote"
          weight="semibold"
          color="primary"
          tabular={valueMono}
          numberOfLines={1}
        >
          {value}
        </Text>
        {hint ? (
          <Text variant="caption2" color="tertiary" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Wrap>
  )
}

function InfoDivider() {
  const c = useClubColors()
  return <View style={[styles.hairline, { backgroundColor: c.borderDefault }]} />
}

function windowAroundFixture(
  rows: TableSnapshotRow[] | null,
  homeTeam: string,
  awayTeam: string,
): TableSnapshotRow[] {
  if (!rows || rows.length === 0) return []
  const idx = rows.findIndex((r) => r.team === homeTeam || r.team === awayTeam)
  if (idx < 0) return rows.slice(0, 5)
  const start = Math.max(0, idx - 2)
  const end = Math.min(rows.length, start + 5)
  return rows.slice(end - 5, end)
}

const styles = StyleSheet.create({
  emptyContainer: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space['2xl'] },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  statusDot: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: 3 },
  heroKickoff: { textAlign: 'center', marginBottom: space.sm },
  heroCrests: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  heroSide: { flex: 1, alignItems: 'center', gap: space.sm },
  heroCenter: { paddingHorizontal: space.lg, paddingTop: space.md },
  heroTeamName: { textAlign: 'center', maxWidth: 120 },
  heroVenue: { textAlign: 'center', marginBottom: space.lg },
  crest: { width: 64, height: 64, borderRadius: 32 },
  crestPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: hairline,
  },
  hairline: { height: hairline },
  infoBlock: { paddingVertical: space.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    gap: space.md,
  },
  infoLabel: { flex: 1 },
  tabEmptyBody: { marginTop: space.xs },
  tableBlock: { paddingTop: space.sm },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: 4,
  },
  tablePlace: { width: 28 },
  tableTeam: { flex: 1 },
  tableNum: { width: 36, textAlign: 'right' },
  tableViewAll: {
    paddingTop: space.md,
    alignItems: 'flex-start',
  },
  footerLink: {
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  tabStrip: {
    flexDirection: 'row',
    borderBottomWidth: hairline,
    marginBottom: space.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabEmpty: {
    padding: space.md,
    borderRadius: card.radius,
    borderWidth: hairline,
    gap: space.xs,
    alignItems: 'flex-start',
  },
})
