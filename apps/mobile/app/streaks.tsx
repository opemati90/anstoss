/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type StreaksLeaderboardEntry = {
  userId: string
  name: string
  attendanceWeeks: number
  motmWeeks: number
}

type MotmArchive = {
  season: string
  topByPlayer: Array<{
    userId: string
    name: string
    avatarUrl: string | null
    count: number
  }>
  byMatch: Array<{
    matchId: string
    kickoffAt: string
    opponentName: string
    motmUserId: string | null
    motmName: string | null
  }>
}

type ImportedFixture = {
  id: string
  homeTeam: string
  awayTeam: string
  competition: string
  kickoffAt: string
  status: string
  resultHome: number | null
  resultAway: number | null
  venueName: string | null
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatKickoff(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function formatMatchDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

function matchResult(f: ImportedFixture, teamName: string): 'W' | 'D' | 'L' | null {
  if (f.resultHome === null || f.resultAway === null) return null
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const club = norm(teamName)
  const isHome =
    club && norm(f.homeTeam).includes(club)
      ? true
      : club && norm(f.awayTeam).includes(club)
        ? false
        : null

  if (isHome === null) {
    // fallback: treat as away
    return f.resultHome > f.resultAway ? 'L' : f.resultHome < f.resultAway ? 'W' : 'D'
  }
  const ours = isHome ? f.resultHome : f.resultAway
  const theirs = isHome ? f.resultAway : f.resultHome
  return ours > theirs ? 'W' : ours < theirs ? 'L' : 'D'
}

export default function StreaksScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const teamId = activeTeamId
  const teamName = activeTeamAccess?.team?.name ?? ''

  const [motmArchive, setMotmArchive] = useState<MotmArchive | null>(null)
  const [leaderboard, setLeaderboard] = useState<StreaksLeaderboardEntry[]>([])
  const [nextFixture, setNextFixture] = useState<ImportedFixture | null | undefined>(undefined)
  const [recentFixtures, setRecentFixtures] = useState<ImportedFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const fetches: Promise<unknown>[] = [
        api<MotmArchive>(`/clubs/${clubId}/motm/archive`).catch(() => null),
        api<{ leaderboard: StreaksLeaderboardEntry[] }>(`/clubs/${clubId}/streaks`)
          .then((r) => r?.leaderboard ?? [])
          .catch(() => []),
      ]

      if (teamId) {
        fetches.push(
          api<ImportedFixture[]>(
            `/clubs/${clubId}/teams/${teamId}/fixtures?scope=upcoming&limit=1`,
          )
            .then((r) => r?.[0] ?? null)
            .catch(() => null),
          api<ImportedFixture[]>(
            `/clubs/${clubId}/teams/${teamId}/fixtures?scope=recent&limit=5`,
          ).catch(() => []),
        )
      }

      const results = await Promise.all(fetches)
      setMotmArchive(results[0] as MotmArchive | null)
      setLeaderboard(results[1] as StreaksLeaderboardEntry[])
      if (teamId) {
        setNextFixture(results[2] as ImportedFixture | null)
        setRecentFixtures((results[3] as ImportedFixture[]) ?? [])
      } else {
        setNextFixture(null)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId, teamId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void fetchData()
  }, [fetchData])

  const topMotm = motmArchive?.topByPlayer.slice(0, 5) ?? []
  const topAttendance = leaderboard
    .slice()
    .sort((a, b) => b.attendanceWeeks - a.attendanceWeeks || a.name.localeCompare(b.name))
    .slice(0, 5)

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('stats.title', { defaultValue: 'Team Stats' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Next Match */}
          {teamId && nextFixture !== undefined ? (
            <Section eyebrow={t('stats.nextMatch', { defaultValue: 'NEXT MATCH' })} c={c}>
              {nextFixture ? (
                <View
                  style={[
                    styles.nextMatchCard,
                    { backgroundColor: c.primary, borderColor: c.primary },
                  ]}
                >
                  <Text style={[styles.matchCompetition, { color: withAlpha('#ffffff', 0.65) }]}>
                    {nextFixture.competition}
                  </Text>
                  <View style={styles.matchTeamsRow}>
                    <Text
                      variant="headline"
                      weight="semibold"
                      style={[styles.matchTeam, { color: '#fff' }]}
                      numberOfLines={1}
                    >
                      {nextFixture.homeTeam}
                    </Text>
                    <View style={[styles.vsBadge, { backgroundColor: withAlpha('#ffffff', 0.15) }]}>
                      <Text variant="caption1" weight="semibold" style={{ color: withAlpha('#ffffff', 0.8) }}>
                        VS
                      </Text>
                    </View>
                    <Text
                      variant="headline"
                      weight="semibold"
                      style={[styles.matchTeam, styles.matchTeamRight, { color: '#fff' }]}
                      numberOfLines={1}
                    >
                      {nextFixture.awayTeam}
                    </Text>
                  </View>
                  <View style={styles.matchMeta}>
                    <Icon name="calendar" size={12} color={withAlpha('#ffffff', 0.7) as never} />
                    <Text style={[styles.matchMetaText, { color: withAlpha('#ffffff', 0.75) }]}>
                      {formatKickoff(nextFixture.kickoffAt)}
                    </Text>
                    {nextFixture.venueName ? (
                      <>
                        <View style={styles.metaDot} />
                        <Icon name="mappin" size={12} color={withAlpha('#ffffff', 0.7) as never} />
                        <Text
                          style={[styles.matchMetaText, { color: withAlpha('#ffffff', 0.75) }]}
                          numberOfLines={1}
                        >
                          {nextFixture.venueName}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : (
                <EmptyCard
                  label={t('stats.noUpcomingMatch', { defaultValue: 'No upcoming match scheduled' })}
                  c={c}
                />
              )}
            </Section>
          ) : null}

          {/* Recent Form */}
          {teamId && recentFixtures.length > 0 ? (
            <Section eyebrow={t('stats.recentForm', { defaultValue: 'RECENT FORM' })} c={c}>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {recentFixtures.map((f, idx) => {
                  const result = matchResult(f, teamName)
                  const scoreStr =
                    f.resultHome !== null && f.resultAway !== null
                      ? `${f.resultHome}–${f.resultAway}`
                      : null
                  return (
                    <View
                      key={f.id}
                      style={[
                        styles.formRow,
                        idx < recentFixtures.length - 1 && {
                          borderBottomColor: c.borderDefault,
                          borderBottomWidth: hairline,
                        },
                      ]}
                    >
                      <ResultBadge result={result} c={c} />
                      <View style={styles.formMatchInfo}>
                        <Text variant="callout" color="primary" numberOfLines={1} weight="medium">
                          {f.homeTeam} — {f.awayTeam}
                        </Text>
                        <Text variant="caption1" color="tertiary">
                          {formatMatchDate(f.kickoffAt)}
                          {f.competition ? ` · ${f.competition}` : ''}
                        </Text>
                      </View>
                      {scoreStr ? (
                        <Text variant="callout" weight="semibold" color="primary" tabular>
                          {scoreStr}
                        </Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>
            </Section>
          ) : null}

          {/* MOTM Board */}
          <Section eyebrow={t('stats.motmBoard', { defaultValue: 'MAN OF THE MATCH' })} c={c}>
            {topMotm.length > 0 ? (
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {topMotm.map((p, idx) => (
                  <LeaderRow
                    key={p.userId}
                    rank={idx + 1}
                    name={p.name}
                    value={p.count}
                    valueSuffix={t('stats.awards', { defaultValue: 'awards' })}
                    icon="trophy.fill"
                    iconColor={idx === 0 ? '#F5A623' : c.primary}
                    isLast={idx === topMotm.length - 1}
                    c={c}
                  />
                ))}
              </View>
            ) : (
              <EmptyCard
                label={t('stats.noMotmData', { defaultValue: 'No MOTM votes recorded yet' })}
                c={c}
              />
            )}
          </Section>

          {/* Attendance Leaders */}
          {topAttendance.length > 0 && topAttendance.some((p) => p.attendanceWeeks > 0) ? (
            <Section eyebrow={t('stats.attendanceLeaders', { defaultValue: 'ATTENDANCE LEADERS' })} c={c}>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {topAttendance.map((p, idx) => (
                  <LeaderRow
                    key={p.userId}
                    rank={idx + 1}
                    name={p.name}
                    value={p.attendanceWeeks}
                    valueSuffix={t('stats.weeks', { defaultValue: 'weeks' })}
                    icon="checkmark.seal.fill"
                    iconColor={c.success}
                    isLast={idx === topAttendance.length - 1}
                    c={c}
                  />
                ))}
              </View>
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

function Section({
  eyebrow,
  children,
  c,
}: {
  eyebrow: string
  children: React.ReactNode
  c: ReturnType<typeof import('../src/context/ClubThemeContext').useClubColors>
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.eyebrow, { color: c.textTertiary }]}>{eyebrow}</Text>
      {children}
    </View>
  )
}

function LeaderRow({
  rank,
  name,
  value,
  valueSuffix,
  icon,
  iconColor,
  isLast,
  c,
}: {
  rank: number
  name: string
  value: number
  valueSuffix: string
  icon: import('../src/components/ui').IconName
  iconColor: string
  isLast: boolean
  c: ReturnType<typeof import('../src/context/ClubThemeContext').useClubColors>
}) {
  return (
    <View
      style={[
        styles.leaderRow,
        !isLast && { borderBottomColor: c.borderDefault, borderBottomWidth: hairline },
      ]}
    >
      <Text
        variant="caption1"
        color="tertiary"
        weight="semibold"
        tabular
        style={styles.rankNum}
      >
        {String(rank)}
      </Text>
      <View style={[styles.avatarCircle, { backgroundColor: withAlpha(iconColor, 0.12) }]}>
        <Text variant="footnote" weight="bold" style={{ color: iconColor }}>
          {initials(name)}
        </Text>
      </View>
      <Text variant="body" color="primary" style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.valueRow}>
        <Icon name={icon} size={14} color={iconColor as never} />
        <Text variant="callout" weight="semibold" color="primary" tabular>
          {String(value)}
        </Text>
        <Text variant="caption1" color="tertiary">
          {valueSuffix}
        </Text>
      </View>
    </View>
  )
}

function ResultBadge({
  result,
  c,
}: {
  result: 'W' | 'D' | 'L' | null
  c: ReturnType<typeof import('../src/context/ClubThemeContext').useClubColors>
}) {
  const bg =
    result === 'W'
      ? c.success
      : result === 'L'
        ? c.error
        : result === 'D'
          ? c.warning
          : c.borderDefault
  const label = result ?? '?'
  return (
    <View style={[styles.resultBadge, { backgroundColor: withAlpha(bg, 0.15) }]}>
      <Text variant="caption1" weight="bold" style={{ color: bg }}>
        {label}
      </Text>
    </View>
  )
}

function EmptyCard({
  label,
  c,
}: {
  label: string
  c: ReturnType<typeof import('../src/context/ClubThemeContext').useClubColors>
}) {
  return (
    <View
      style={[
        styles.emptyCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="subheadline" color="tertiary" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['2xl'],
    gap: space.xs,
  },
  section: { gap: space.sm, marginTop: space.sm },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Next match card
  nextMatchCard: {
    borderRadius: radius.lg,
    padding: space.md,
    gap: 8,
    borderWidth: hairline,
  },
  matchCompetition: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  matchTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 4,
  },
  matchTeam: { flex: 1 },
  matchTeamRight: { textAlign: 'right' },
  vsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  matchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  matchMetaText: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // List cards (leader boards + form)
  listCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 52,
  },
  rankNum: { width: 18, textAlign: 'center' },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Recent form
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 52,
  },
  formMatchInfo: { flex: 1, gap: 2 },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    alignItems: 'center',
  },
})
