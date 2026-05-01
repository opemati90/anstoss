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
import { Screen, Text } from '../src/components/ui'
import { TEXT_WHITE } from '../src/theme/colors'
import { hexToRgba } from '../src/theme/club-theme'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { hairline, radius, space } from '../src/theme/tokens'

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
  const dateShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(kickoff)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(kickoff)
  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(kickoff)
  const isFinished = fixture.status === 'finished'
  const isLive = fixture.status === 'live'
  const hasResult = fixture.resultHome != null && fixture.resultAway != null
  const hasTable = fixture.tableSnapshot && (fixture.tableSnapshot as unknown[]).length > 0
  const overlay = fixture.overlay

  const heroFoot = [weekday, timeStr].filter(Boolean).join(' · ')

  const openMaps = () => {
    if (!fixture.pitchAddress) return
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(fixture.pitchAddress)}`)
  }

  const fussballUrl =
    typeof fixture.rawPayload?.url === 'string'
      ? (fixture.rawPayload.url as string)
      : null
  const openFussball = () => {
    if (!fussballUrl) return
    Linking.openURL(fussballUrl)
  }

  const heroEyebrow = [fixture.competition, dateShort].filter(Boolean).join(' · ').toUpperCase()

  return (
    <Screen
      header={<ModalHeader title={fixture.competition} />}
      scroll={false}
      padded={false}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — club-primary background, white text, vs layout */}
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <View style={styles.heroEyebrowRow}>
            <Text variant="caption2" tracking="wide" style={[styles.heroEyebrow, { color: hexToRgba(TEXT_WHITE, 0.7) }]}>
              {heroEyebrow}
            </Text>
            {isLive ? (
              <View style={[styles.liveBadge, { backgroundColor: c.error }]}>
                <Text variant="caption2" weight="semibold" style={{ color: TEXT_WHITE }}>
                  {t('fussball.status.live').toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroVs}>
            <View style={styles.heroSide}>
              {fixture.homeLogo ? (
                <Image source={{ uri: fixture.homeLogo }} style={styles.heroCrest} />
              ) : (
                <View style={[styles.heroCrestPlaceholder, { backgroundColor: TEXT_WHITE }]}>
                  <Text variant="footnote" weight="bold" style={{ color: c.primary }}>
                    {abbreviate(fixture.homeTeam)}
                  </Text>
                </View>
              )}
              <Text variant="footnote" weight="semibold" style={[styles.heroSideName, { color: TEXT_WHITE }]} numberOfLines={2}>
                {fixture.homeTeam}
              </Text>
            </View>

            <View style={styles.heroCenter}>
              {hasResult ? (
                <Text variant="largeTitle" tabular weight="bold" style={{ color: TEXT_WHITE }}>
                  {fixture.resultHome}
                  <Text variant="largeTitle" weight="regular" style={{ color: hexToRgba(TEXT_WHITE, 0.55) }}>
                    {' : '}
                  </Text>
                  {fixture.resultAway}
                </Text>
              ) : (
                <View style={[styles.vsPill, { backgroundColor: hexToRgba(TEXT_WHITE, 0.14) }]}>
                  <Text variant="footnote" weight="semibold" style={{ color: TEXT_WHITE }}>
                    {t('matches.vs')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.heroSide}>
              {fixture.awayLogo ? (
                <Image source={{ uri: fixture.awayLogo }} style={styles.heroCrest} />
              ) : (
                <View style={[styles.heroCrestPlaceholder, { backgroundColor: hexToRgba(TEXT_WHITE, 0.92) }]}>
                  <Text variant="footnote" weight="bold" style={{ color: c.primary }}>
                    {abbreviate(fixture.awayTeam)}
                  </Text>
                </View>
              )}
              <Text variant="footnote" weight="semibold" style={[styles.heroSideName, { color: TEXT_WHITE }]} numberOfLines={2}>
                {fixture.awayTeam}
              </Text>
            </View>
          </View>

          <View style={[styles.heroFootRule, { borderTopColor: hexToRgba(TEXT_WHITE, 0.2) }]}>
            <Text variant="footnote" style={{ color: hexToRgba(TEXT_WHITE, 0.85), textAlign: 'center' }}>
              {heroFoot}
            </Text>
            {fixture.venueName ? (
              <Text variant="caption2" style={{ color: hexToRgba(TEXT_WHITE, 0.65), textAlign: 'center', marginTop: 2 }}>
                {[fixture.venueName, fixture.pitchAddress].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* SECTION — Kickoff */}
        <SectionLabel>{t('matches.section.kickoff', { defaultValue: 'Kickoff' })}</SectionLabel>
        <View style={styles.section}>
          <KvRow
            label={t('matches.tab.kickoffLabel', { defaultValue: 'When' })}
            value={`${weekday}, ${timeStr}`}
            valueMono
          />
          {fixture.venueName ? (
            <>
              <Divider />
              <KvRow
                label={t('matches.tab.venueLabel', { defaultValue: 'Where' })}
                value={fixture.venueName}
                hint={fixture.pitchAddress ?? undefined}
                onPress={fixture.pitchAddress ? openMaps : undefined}
              />
            </>
          ) : null}
          {fixture.competition ? (
            <>
              <Divider />
              <KvRow
                label={t('matches.tab.leagueLabel', { defaultValue: 'League' })}
                value={fixture.competition}
              />
            </>
          ) : null}
          {isCoach && overlay?.arrivalTime ? (
            <>
              <Divider />
              <KvRow
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
              <Divider />
              <KvRow label={t('matches.meetingPoint')} value={overlay.meetingPoint} />
            </>
          ) : null}
          {isCoach && overlay?.kitColor ? (
            <>
              <Divider />
              <KvRow label={t('matches.kitColor')} value={overlay.kitColor} />
            </>
          ) : null}
        </View>

        {/* SECTION — League snippet */}
        {hasTable ? (
          <>
            <SectionLabel>
              {t('matches.section.league', { defaultValue: 'League' })}
              {fixture.competition ? ` · ${fixture.competition}` : ''}
            </SectionLabel>
            <View style={styles.section}>
              <View style={[styles.tableHead, { borderBottomColor: c.borderDefault }]}>
                <Text variant="caption2" color="tertiary" style={styles.tablePos}>#</Text>
                <Text variant="caption2" color="tertiary" style={styles.tableTeam}>
                  {t('matches.colTeam', { defaultValue: 'Club' })}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum}>
                  {t('matches.colP', { defaultValue: 'P' })}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum}>
                  {t('matches.colGD', { defaultValue: 'GD' })}
                </Text>
                <Text variant="caption2" color="tertiary" style={styles.tableNum}>
                  {t('matches.colPts', { defaultValue: 'Pts' })}
                </Text>
              </View>
              {windowAroundFixture(
                fixture.tableSnapshot as TableSnapshotRow[],
                fixture.homeTeam,
                fixture.awayTeam,
              ).map((row, i, arr) => {
                const mine = row.team === fixture.homeTeam || row.team === fixture.awayTeam
                return (
                  <View key={`${row.place}-${row.team}`}>
                    <View style={styles.tableRow}>
                      <Text
                        variant="footnote"
                        color={mine ? c.primary : 'secondary'}
                        weight={mine ? 'bold' : 'regular'}
                        tabular
                        style={styles.tablePos}
                      >
                        {row.place}
                      </Text>
                      <Text
                        variant="footnote"
                        color={mine ? 'primary' : 'primary'}
                        weight={mine ? 'semibold' : 'regular'}
                        numberOfLines={1}
                        style={styles.tableTeam}
                      >
                        {row.team}
                      </Text>
                      <Text variant="footnote" color="secondary" tabular style={styles.tableNum}>
                        {row.games}
                      </Text>
                      <Text variant="footnote" color="secondary" tabular style={styles.tableNum}>
                        {row.goalDifference > 0 ? '+' : ''}
                        {row.goalDifference}
                      </Text>
                      <Text
                        variant="footnote"
                        color={mine ? c.primary : 'primary'}
                        weight={mine ? 'bold' : 'semibold'}
                        tabular
                        style={styles.tableNum}
                      >
                        {row.points}
                      </Text>
                    </View>
                    {i < arr.length - 1 ? <Divider /> : null}
                  </View>
                )
              })}
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/league-table', params: { teamId: fixture.teamId } })
                }
                accessibilityRole="button"
                style={styles.viewAll}
              >
                <Text variant="footnote" weight="semibold" color={c.primary}>
                  {t('matches.viewTable', { defaultValue: 'View full table' })} →
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* SECTION — Open in fussball.de */}
        {fussballUrl ? (
          <Pressable
            onPress={openFussball}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.textPrimary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text variant="footnote" weight="semibold" style={{ color: c.textInverse }}>
              {t('matches.openInFussball', { defaultValue: 'Open in fussball.de' })}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.sectionLabel}>
      {String(children).toUpperCase()}
    </Text>
  )
}

function KvRow({
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
  const Wrap = onPress ? Pressable : View
  return (
    <Wrap
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label} ${value}` : undefined}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        styles.kvRow,
        pressed && onPress ? { opacity: 0.55 } : null,
      ]}
    >
      <Text variant="footnote" color="secondary" style={styles.kvLabel}>
        {label}
      </Text>
      <View style={styles.kvValueWrap}>
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

function Divider() {
  const c = useClubColors()
  return <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
}

function abbreviate(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
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
  content: { padding: space.md, paddingBottom: space['2xl'], gap: space.md },

  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  heroEyebrow: { letterSpacing: 1.2 },
  liveBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
  },
  heroVs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  heroSide: { flex: 1, alignItems: 'center', gap: space.sm },
  heroCenter: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  heroCrest: { width: 56, height: 56, borderRadius: radius.md },
  heroCrestPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSideName: { textAlign: 'center', maxWidth: 120, lineHeight: 16 },
  vsPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
  },
  heroFootRule: {
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderStyle: 'dashed',
  },

  sectionLabel: {
    letterSpacing: 1.4,
    paddingHorizontal: space['2xs'],
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  section: {
    paddingHorizontal: space['2xs'],
  },

  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    gap: space.md,
  },
  kvLabel: { flex: 1 },
  kvValueWrap: { flexShrink: 1, alignItems: 'flex-end', gap: 2 },
  divider: { height: hairline },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    borderBottomWidth: hairline,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  tablePos: { width: 24, textAlign: 'left' },
  tableTeam: { flex: 1 },
  tableNum: { width: 36, textAlign: 'right' },

  viewAll: { paddingTop: space.sm, paddingBottom: space.xs },

  cta: {
    paddingVertical: space.md,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
})
