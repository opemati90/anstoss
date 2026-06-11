/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
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

type Streaks = {
  me: {
    attendanceWeeks: number
    attendanceLongest: number
    motmWeeks: number
    motmLongest: number
    lastActivityAt: string
  }
  leaderboard: Array<{
    userId: string
    name: string
    attendanceWeeks: number
    motmWeeks: number
  }>
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

/**
 * Pure-fn badge ladder. Each tier requires N consecutive weeks. Returns
 * the highest tier the user has earned for a given streak count.
 */
type Badge = {
  tier: number
  label: string
  emoji: string
  weeks: number
}

// Badge labels are now resolved at render time via t() — see badgeLabel() below.
const ATTENDANCE_LADDER: Badge[] = [
  { tier: 1, label: 'Regular', emoji: '🌱', weeks: 3 },
  { tier: 2, label: 'Reliable', emoji: '⚡', weeks: 6 },
  { tier: 3, label: 'Iron-clad', emoji: '🔥', weeks: 10 },
  { tier: 4, label: 'Legend', emoji: '🏆', weeks: 16 },
]

const MOTM_LADDER: Badge[] = [
  { tier: 1, label: 'On the radar', emoji: '⭐', weeks: 1 },
  { tier: 2, label: 'In form', emoji: '🌟', weeks: 3 },
  { tier: 3, label: 'Talisman', emoji: '🌠', weeks: 5 },
  { tier: 4, label: 'Untouchable', emoji: '👑', weeks: 8 },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFn = (key: string, opts?: any) => string

function attendanceBadgeLabel(tier: number, t: TFn): string {
  switch (tier) {
    case 1: return t('streaks.badge.att.regular', { defaultValue: 'Regular' })
    case 2: return t('streaks.badge.att.reliable', { defaultValue: 'Reliable' })
    case 3: return t('streaks.badge.att.ironClad', { defaultValue: 'Iron-clad' })
    case 4: return t('streaks.badge.att.legend', { defaultValue: 'Legend' })
    default: return t('streaks.badge.att.regular', { defaultValue: 'Regular' })
  }
}

function motmBadgeLabel(tier: number, t: TFn): string {
  switch (tier) {
    case 1: return t('streaks.badge.motm.radar', { defaultValue: 'On the radar' })
    case 2: return t('streaks.badge.motm.inForm', { defaultValue: 'In form' })
    case 3: return t('streaks.badge.motm.talisman', { defaultValue: 'Talisman' })
    case 4: return t('streaks.badge.motm.untouchable', { defaultValue: 'Untouchable' })
    default: return t('streaks.badge.motm.radar', { defaultValue: 'On the radar' })
  }
}

function highestEarned(weeks: number, ladder: Badge[]): Badge | null {
  let earned: Badge | null = null
  for (const b of ladder) {
    if (weeks >= b.weeks) earned = b
    else break
  }
  return earned
}

function nextTier(weeks: number, ladder: Badge[]): Badge | null {
  for (const b of ladder) {
    if (weeks < b.weeks) return b
  }
  return null
}

export default function StreaksScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [data, setData] = useState<Streaks | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Streaks>(`/clubs/${clubId}/streaks`)
      setData(result ?? null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const attBadge = useMemo(
    () => (data ? highestEarned(data.me.attendanceWeeks, ATTENDANCE_LADDER) : null),
    [data],
  )
  const motmBadge = useMemo(
    () => (data ? highestEarned(data.me.motmWeeks, MOTM_LADDER) : null),
    [data],
  )
  const attNext = useMemo(
    () => (data ? nextTier(data.me.attendanceWeeks, ATTENDANCE_LADDER) : null),
    [data],
  )
  const motmNext = useMemo(
    () => (data ? nextTier(data.me.motmWeeks, MOTM_LADDER) : null),
    [data],
  )

  const sortedBoard = useMemo(() => {
    if (!data) return []
    return data.leaderboard
      .slice()
      .sort(
        (a, b) =>
          b.attendanceWeeks - a.attendanceWeeks ||
          b.motmWeeks - a.motmWeeks ||
          a.name.localeCompare(b.name),
      )
  }, [data])

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('streaks.title', { defaultValue: 'Streaks' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading || !data ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void fetchData()
              }}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('streaks.eyebrow', { defaultValue: 'YOUR STREAKS' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {data.me.attendanceWeeks}
            <Text variant="title2" color="secondary">
              {' '}
              {t('streaks.weeksUnit', { defaultValue: 'weeks' })}
            </Text>
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('streaks.subtitle', {
              defaultValue:
                'Show up week after week — the squad sees who carries the team.',
            })}
          </Text>

          {/* Hero badge cards */}
          <View style={styles.heroRow}>
            <BadgeCard
              eyebrow={t('streaks.attendanceLabel', { defaultValue: 'ATTENDANCE' })}
              streak={data.me.attendanceWeeks}
              longest={data.me.attendanceLongest}
              badge={attBadge}
              next={attNext}
              tone={c.success}
              c={c}
              t={t}
              isAttendance
            />
            <BadgeCard
              eyebrow={t('streaks.motmLabel', { defaultValue: 'MOTM' })}
              streak={data.me.motmWeeks}
              longest={data.me.motmLongest}
              badge={motmBadge}
              next={motmNext}
              tone={c.primary}
              c={c}
              t={t}
              isAttendance={false}
            />
          </View>

          {/* Attendance ladder */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('streaks.ladderAttendance', {
              defaultValue: 'ATTENDANCE LADDER',
            })}
          </Text>
          <Ladder
            ladder={ATTENDANCE_LADDER}
            current={data.me.attendanceWeeks}
            tone={c.success}
            c={c}
            t={t}
            isAttendance
          />

          {/* MOTM ladder */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('streaks.ladderMotm', { defaultValue: 'MOTM LADDER' })}
          </Text>
          <Ladder
            ladder={MOTM_LADDER}
            current={data.me.motmWeeks}
            tone={c.primary}
            c={c}
            t={t}
            isAttendance={false}
          />

          {/* Squad leaderboard */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('streaks.leaderboard', { defaultValue: 'SQUAD LEADERBOARD' })}
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {sortedBoard.map((row, idx) => {
              const me = row.userId === user?.id
              const rankBadge =
                idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
              return (
                <View
                  key={row.userId}
                  style={[
                    styles.boardRow,
                    idx > 0 && {
                      borderTopWidth: hairline,
                      borderTopColor: c.borderDefault,
                    },
                    me && { backgroundColor: withAlpha(c.primary, 0.06) },
                  ]}
                >
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: c.surfaceSunken ?? c.background, borderColor: c.borderDefault },
                    ]}
                  >
                    {rankBadge ? (
                      <Text style={styles.rankEmoji}>{rankBadge}</Text>
                    ) : (
                      <Text style={[styles.rankNum, { color: c.textPrimary }]} tabular>
                        {idx + 1}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: c.surfaceSunken ?? c.background,
                        borderColor: c.borderDefault,
                      },
                    ]}
                  >
                    <Text style={[styles.avatarText, { color: c.textPrimary }]}>
                      {initials(row.name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {row.name}
                      {me ? (
                        <Text variant="caption2" color="primary">
                          {'  '}·{'  '}
                          {t('streaks.youTag', { defaultValue: 'you' })}
                        </Text>
                      ) : null}
                    </Text>
                    <View style={styles.metaRow}>
                      <Icon name="flame" size={11} color={c.success} />
                      <Text variant="caption2" color="secondary" tabular>
                        {row.attendanceWeeks}w
                      </Text>
                      <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                      <Icon name="star.fill" size={11} color={c.primary} />
                      <Text variant="caption2" color="secondary" tabular>
                        {row.motmWeeks}
                      </Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('streaks.footer', {
              defaultValue:
                'Streaks reset Monday at 00:00. Miss a session and the counter starts again — that\'s the deal.',
            })}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function BadgeCard({
  eyebrow,
  streak,
  longest,
  badge,
  next,
  tone,
  c,
  t,
  isAttendance,
}: {
  eyebrow: string
  streak: number
  longest: number
  badge: Badge | null
  next: Badge | null
  tone: string
  c: ReturnType<typeof useClubColors>
  t: TFn
  isAttendance: boolean
}) {
  const progress = next ? Math.min(1, streak / next.weeks) : 1
  return (
    <View
      style={[
        styles.heroCard,
        {
          backgroundColor: c.surface,
          borderColor: badge ? withAlpha(tone, 0.3) : c.borderDefault,
        },
      ]}
    >
      <Text style={[styles.tinyEyebrow, { color: tone }]}>{eyebrow}</Text>
      <View style={styles.heroBadgeRow}>
        <Text style={styles.heroEmoji}>{badge?.emoji ?? '🥚'}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="title3" color="primary" weight="semibold" tabular>
            {streak}w
          </Text>
          <Text variant="caption2" color="tertiary">
            {badge
              ? (isAttendance ? attendanceBadgeLabel(badge.tier, t) : motmBadgeLabel(badge.tier, t))
              : t('streaks.unranked', { defaultValue: 'Just starting' })}
          </Text>
        </View>
      </View>
      {next ? (
        <>
          <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: tone },
              ]}
            />
          </View>
          <Text variant="caption2" color="tertiary" tabular>
            {t('streaks.toNext', {
              defaultValue: '{{remaining}} to {{badge}}',
              remaining: next.weeks - streak,
              badge: isAttendance ? attendanceBadgeLabel(next.tier, t) : motmBadgeLabel(next.tier, t),
            })}
          </Text>
        </>
      ) : (
        <Text variant="caption2" color="tertiary">
          {t('streaks.maxed', { defaultValue: 'All tiers earned 🎉' })}
        </Text>
      )}
      {longest > streak ? (
        <Text variant="caption2" color="tertiary" tabular>
          {t('streaks.longest', {
            defaultValue: 'Longest: {{n}}w',
            n: longest,
          })}
        </Text>
      ) : null}
    </View>
  )
}

function Ladder({
  ladder,
  current,
  tone,
  c,
  t,
  isAttendance,
}: {
  ladder: Badge[]
  current: number
  tone: string
  c: ReturnType<typeof useClubColors>
  t: TFn
  isAttendance: boolean
}) {
  return (
    <View
      style={[
        styles.list,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      {ladder.map((b, idx) => {
        const earned = current >= b.weeks
        return (
          <View
            key={b.tier}
            style={[
              styles.ladderRow,
              idx > 0 && {
                borderTopWidth: hairline,
                borderTopColor: c.borderDefault,
              },
            ]}
          >
            <View
              style={[
                styles.ladderEmojiWrap,
                {
                  backgroundColor: earned ? withAlpha(tone, 0.12) : c.surfaceSunken ?? c.background,
                },
              ]}
            >
              <Text
                style={
                  earned
                    ? styles.ladderEmoji
                    : [styles.ladderEmoji, { opacity: 0.45 }]
                }
              >
                {b.emoji}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                {isAttendance ? attendanceBadgeLabel(b.tier, t) : motmBadgeLabel(b.tier, t)}
              </Text>
              <Text variant="caption2" color="tertiary" tabular>
                {b.weeks}w
              </Text>
            </View>
            {earned ? (
              <View
                style={[
                  styles.earnedPill,
                  { backgroundColor: withAlpha(tone, 0.12) },
                ]}
              >
                <Icon name="checkmark" size={11} color={tone} />
                <Text style={[styles.earnedPillText, { color: tone }]}>
                  {t('streaks.earned', { defaultValue: 'EARNED' })}
                </Text>
              </View>
            ) : (
              <Text variant="caption2" color="tertiary" tabular>
                {t('streaks.weeksToGo', { defaultValue: '{{n}}w to go', n: b.weeks - current })}
              </Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  tinyEyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  heroRow: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  heroCard: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
  },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroEmoji: { fontSize: 32 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  list: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },

  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  ladderEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderEmoji: { fontSize: 22 },
  earnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  earnedPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankEmoji: { fontSize: 14 },
  rankNum: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaDot: { fontSize: 10, fontFamily: fonts.label },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
