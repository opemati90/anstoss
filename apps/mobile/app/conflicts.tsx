/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'
import {
  type ChildEvent,
  type ConflictPair,
  type Kid,
  findConflicts,
} from '../src/lib/scheduleConflicts'

type Agenda = {
  kids: Kid[]
  events: (ChildEvent & { clubId: string })[]
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

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function urgencyTone(daysAway: number): 'error' | 'warning' | 'info' {
  if (daysAway <= 3) return 'error'
  if (daysAway <= 7) return 'warning'
  return 'info'
}

export default function ConflictsScreen() {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const locale = i18n.language

  const [data, setData] = useState<Agenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // /me/children-agenda was deferred; derive the same {kids, events}
      // shape from /me/children-events (which is real). One source of
      // truth keeps the conflict scanner aligned with what ParentHome
      // sees on the same screen.
      type CrossTeamEvent = {
        id: string
        clubId: string
        title: string
        date: string
        location?: string | null
        teamName?: string
        childUserId?: string
        childName?: string
      }
      const events = await api<CrossTeamEvent[]>('/me/children-events?limit=50')
      const kidMap = new Map<string, Kid>()
      const childEvents: (ChildEvent & { clubId: string })[] = []
      for (const e of events ?? []) {
        if (!e.childUserId) continue
        if (!kidMap.has(e.childUserId)) {
          kidMap.set(e.childUserId, {
            userId: e.childUserId,
            name: e.childName ?? 'Child',
            teamName: e.teamName ?? '',
          })
        }
        childEvents.push({
          id: e.id,
          clubId: e.clubId,
          kidId: e.childUserId,
          title: e.title,
          date: e.date,
          location: e.location ?? null,
          rsvp: 'PENDING',
        })
      }
      setData({ kids: Array.from(kidMap.values()), events: childEvents })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const conflicts = useMemo(() => {
    if (!data) return []
    return findConflicts(data.events).sort((x, y) => x.daysAway - y.daysAway)
  }, [data])

  const kidById = useMemo(() => {
    const map = new Map<string, Kid>()
    for (const k of data?.kids ?? []) map.set(k.userId, k)
    return map
  }, [data])

  const resolveByMarkingOut = (conflict: ConflictPair, target: ChildEvent) => {
    const kid = kidById.get(target.kidId)
    if (!kid) return
    const otherKid = kidById.get(
      target.id === conflict.a.id ? conflict.b.kidId : conflict.a.kidId,
    )
    Alert.alert(
      t('conflicts.markOutTitle', { defaultValue: 'Mark out of session?' }),
      t('conflicts.markOutBody', {
        defaultValue:
          "{{name}} will be marked NO for {{event}}. {{other}}'s event stays unchanged.",
        name: kid.name,
        event: target.title,
        other: otherKid?.name ?? '',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('conflicts.markOut', { defaultValue: 'Mark out' }),
          style: 'destructive',
          onPress: async () => {
            setResolving(conflict.id)
            try {
              // /me/children-events/:id/rsvp was never built. Use the
              // clubId-scoped proxy with childUserId. The clubId rides
              // on each event from /me/children-events (CrossTeamEvent),
              // so no extra round-trip to resolve it.
              const clubId = (target as ChildEvent & { clubId?: string }).clubId
              if (!clubId) {
                throw new Error('Event missing clubId')
              }
              await api(`/clubs/${clubId}/events/${target.id}/rsvp-proxy`, {
                method: 'PUT',
                body: { status: 'NO', childUserId: target.kidId },
              })
              await fetchData()
            } catch {
              Alert.alert(
                t('common.error'),
                t('conflicts.resolveError', {
                  defaultValue: "Couldn't update RSVP. Try again.",
                }),
              )
            } finally {
              setResolving(null)
            }
          },
        },
      ],
    )
  }

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('conflicts.title', { defaultValue: 'Schedule conflicts' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : !data || data.kids.length < 2 ? (
        <EmptyState
          icon="figure.2"
          title={t('conflicts.singleKidTitle', {
            defaultValue: 'Conflict scanner is for multi-kid families',
          })}
          description={t('conflicts.singleKidBody', {
            defaultValue:
              'Link a second child in More → Family to start scanning for overlapping training and matches.',
          })}
        />
      ) : conflicts.length === 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={c.primary}
            />
          }
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('conflicts.eyebrow', { defaultValue: 'CONFLICT SCANNER' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('conflicts.allClearTitle', { defaultValue: "You're all clear" })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('conflicts.allClearBody', {
              defaultValue:
                'No overlapping sessions in the next two weeks. We scan every time the schedule changes.',
            })}
          </Text>

          <View
            style={[
              styles.kidsCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
              {t('conflicts.linkedKids', { defaultValue: 'LINKED KIDS' })}
            </Text>
            <View style={styles.kidsRow}>
              {data.kids.map((k) => (
                <View
                  key={k.userId}
                  style={[
                    styles.kidPill,
                    { backgroundColor: withAlpha(c.primary, 0.1), borderColor: withAlpha(c.primary, 0.3) },
                  ]}
                >
                  <View style={[styles.kidDot, { backgroundColor: c.primary }]} />
                  <Text style={[styles.kidPillText, { color: c.primary }]}>
                    {k.name}
                    <Text variant="caption2" color="primary">
                      {'  '}·{'  '}
                      {k.teamName}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Summary card */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: withAlpha(c.error, 0.08),
                borderColor: withAlpha(c.error, 0.3),
              },
            ]}
          >
            <View style={[styles.summaryIcon, { backgroundColor: c.error }]}>
              <Icon name="exclamationmark.circle" size={16} color="inverse" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.eyebrow, { color: c.error }]}>
                {t('conflicts.eyebrow', { defaultValue: 'CONFLICT SCANNER' })}
              </Text>
              <Text variant="callout" color="primary" weight="semibold">
                {t('conflicts.summary', {
                  defaultValue:
                    '{{count}} overlapping session(s) in the next 14 days',
                  count: conflicts.length,
                })}
              </Text>
            </View>
          </View>

          {/* Linked kids strip */}
          <View
            style={[
              styles.kidsCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
              {t('conflicts.linkedKids', { defaultValue: 'LINKED KIDS' })}
            </Text>
            <View style={styles.kidsRow}>
              {data.kids.map((k) => (
                <View
                  key={k.userId}
                  style={[
                    styles.kidPill,
                    { backgroundColor: withAlpha(c.primary, 0.1), borderColor: withAlpha(c.primary, 0.3) },
                  ]}
                >
                  <View style={[styles.kidDot, { backgroundColor: c.primary }]} />
                  <Text style={[styles.kidPillText, { color: c.primary }]}>
                    {k.name}
                    <Text variant="caption2" color="primary">
                      {'  '}·{'  '}
                      {k.teamName}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: space.sm }]}>
            {t('conflicts.upcomingHeader', { defaultValue: 'UPCOMING CONFLICTS' })}
          </Text>

          {conflicts.map((conflict) => {
            const tone = urgencyTone(conflict.daysAway)
            const toneColor =
              tone === 'error' ? c.error : tone === 'warning' ? c.warning : c.primary
            const isResolving = resolving === conflict.id
            const aKid = kidById.get(conflict.a.kidId)
            const bKid = kidById.get(conflict.b.kidId)
            return (
              <View
                key={conflict.id}
                style={[
                  styles.conflictCard,
                  {
                    backgroundColor: c.surface,
                    borderColor: tone === 'error' ? withAlpha(c.error, 0.4) : c.borderDefault,
                  },
                ]}
              >
                <View style={styles.conflictHead}>
                  <View
                    style={[
                      styles.urgencyPill,
                      { backgroundColor: withAlpha(toneColor, 0.12) },
                    ]}
                  >
                    <Text style={[styles.urgencyText, { color: toneColor }]}>
                      {conflict.daysAway === 0
                        ? t('conflicts.today', { defaultValue: 'TODAY' })
                        : t('conflicts.inDays', {
                            defaultValue: 'IN {{count}}D',
                            count: conflict.daysAway,
                          })}
                    </Text>
                  </View>
                  <Text variant="caption2" color="tertiary" tabular>
                    {t('conflicts.overlap', {
                      defaultValue: '{{count}} min overlap',
                      count: conflict.overlapMin,
                    })}
                  </Text>
                </View>

                <Text variant="footnote" color="secondary" style={styles.conflictDate}>
                  {formatDate(conflict.a.date, locale)}
                </Text>

                <View style={styles.eventsStack}>
                  <ConflictSide
                    event={conflict.a}
                    kidName={aKid?.name ?? '—'}
                    teamName={aKid?.teamName ?? ''}
                    locale={locale}
                    accent={c.primary}
                    actionLabel={t('conflicts.markOutFor', {
                      defaultValue: 'Mark {{name}} out',
                      name: aKid?.name ?? '',
                    })}
                    onAction={() => resolveByMarkingOut(conflict, conflict.a)}
                    actionDisabled={isResolving}
                    borderColor={c.borderDefault}
                  />
                  <View style={[styles.overlapRule, { backgroundColor: c.borderDefault }]} />
                  <ConflictSide
                    event={conflict.b}
                    kidName={bKid?.name ?? '—'}
                    teamName={bKid?.teamName ?? ''}
                    locale={locale}
                    accent={c.warning}
                    actionLabel={t('conflicts.markOutFor', {
                      defaultValue: 'Mark {{name}} out',
                      name: bKid?.name ?? '',
                    })}
                    onAction={() => resolveByMarkingOut(conflict, conflict.b)}
                    actionDisabled={isResolving}
                    borderColor={c.borderDefault}
                  />
                </View>
              </View>
            )
          })}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('conflicts.footer', {
              defaultValue:
                'You can also message the coach if neither kid can sit out — we\'ll add multi-coach swap soon.',
            })}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function ConflictSide({
  event,
  kidName,
  teamName,
  locale,
  accent,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  event: ChildEvent
  kidName: string
  teamName: string
  locale: string
  accent: string
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
  borderColor: string
}) {
  return (
    <View style={styles.side}>
      <View style={styles.sideHeader}>
        <View style={[styles.kidDotInline, { backgroundColor: accent }]} />
        <Text variant="caption2" color="secondary" numberOfLines={1} style={styles.kidLine}>
          {kidName}
          {teamName ? ` · ${teamName}` : ''}
        </Text>
      </View>
      <Text variant="footnote" color="primary" weight="semibold" numberOfLines={2} style={styles.sideTitle}>
        {event.title}
      </Text>
      <View style={styles.sideMeta}>
        <Text variant="caption2" color="tertiary" tabular>
          {formatTime(event.date, locale)}
        </Text>
        {event.location ? (
          <>
            <Text variant="caption2" color="tertiary">·</Text>
            <Text variant="caption2" color="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {event.location}
            </Text>
          </>
        ) : null}
      </View>
      <Button
        label={actionLabel}
        variant="bordered"
        size="md"
        fullWidth
        disabled={actionDisabled}
        onPress={onAction}
      />
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
    gap: space.md,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kidsCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 10,
    marginTop: space.sm,
  },
  kidsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  kidDot: { width: 6, height: 6, borderRadius: 3 },
  kidPillText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginLeft: 4,
  },

  conflictCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 10,
  },
  conflictHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  urgencyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  urgencyText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  conflictDate: {
    fontFamily: fonts.label,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontSize: 11,
  },

  eventsStack: {
    gap: 12,
    marginTop: 4,
  },
  side: {
    gap: 4,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sideTitle: {
    marginTop: 2,
    lineHeight: 20,
  },
  sideMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  kidDotInline: { width: 8, height: 8, borderRadius: 4 },
  kidLine: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 10,
    fontFamily: fonts.label,
    flex: 1,
  },
  overlapRule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
