import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { elevation, fonts, hairline, radius, space } from '../../theme/tokens'
import {
  type ChildEvent as ConflictEvent,
  type Kid as ConflictKid,
  findConflicts,
} from '../../lib/scheduleConflicts'

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

type ChildEvent = {
  id: string
  title: string
  date: string
  location?: string | null
  teamName: string
  teamDisplayName: string | null
  /** API: CrossTeamEventItem.childUserId — used for conflict
   * detection when a parent has more than one kid. */
  childUserId?: string
  childName?: string
  childRsvp?: 'YES' | 'MAYBE' | 'NO' | null
}

type ChildAnnouncement = { id: string; title: string; body: string }

type ParentNextActionKind =
  | 'conflict'
  | 'today-event'
  | 'next-event'
  | 'empty-schedule'

type ParentNextActionTarget = 'conflicts' | 'event' | 'schedule'

export type ParentNextAction = {
  kind: ParentNextActionKind
  target: ParentNextActionTarget
  icon: string
  tone: 'primary' | 'warning' | 'neutral'
  eventId?: string
  titleKey: string
  titleOptions?: Record<string, unknown>
  bodyKey: string
  bodyOptions?: Record<string, unknown>
  ctaKey: string
  accessibilityLabelKey: string
  accessibilityLabelOptions?: Record<string, unknown>
}

export function getParentNextAction({
  event,
  conflictCount,
  nextConflict,
  locale,
  nowMs = Date.now(),
}: {
  event: ChildEvent | null
  conflictCount: number
  nextConflict: ReturnType<typeof findConflicts>[number] | null
  locale: string
  nowMs?: number
}): ParentNextAction {
  if (conflictCount > 0) {
    return {
      kind: 'conflict',
      target: 'conflicts',
      icon: 'exclamationmark.triangle.fill',
      tone: 'warning',
      titleKey: 'home.parent.actionConflictTitle',
      titleOptions: { count: conflictCount },
      bodyKey: 'home.parent.actionConflictBody',
      bodyOptions: {
        count: conflictCount,
        days: nextConflict?.daysAway ?? 0,
        when: formatConflictWhen(nextConflict?.daysAway ?? 0, locale),
      },
      ctaKey: 'home.parent.actionConflictCta',
      accessibilityLabelKey: 'home.parent.actionConflictA11y',
      accessibilityLabelOptions: { count: conflictCount },
    }
  }

  if (event) {
    const team = event.teamDisplayName || event.teamName
    const child = event.childName || team
    const when = formatActionWhen(event.date, locale, nowMs)
    const location = event.location ? ` · ${event.location}` : ''
    const isToday = isSameLocalDay(event.date, nowMs)

    return {
      kind: isToday ? 'today-event' : 'next-event',
      target: 'event',
      icon: isToday ? 'clock.fill' : 'calendar.fill',
      tone: 'primary',
      eventId: event.id,
      titleKey: isToday
        ? 'home.parent.actionTodayTitle'
        : 'home.parent.actionNextTitle',
      titleOptions: {
        child,
        title: event.title,
      },
      bodyKey: isToday
        ? 'home.parent.actionTodayBody'
        : 'home.parent.actionNextBody',
      bodyOptions: {
        team,
        title: event.title,
        when,
        location,
      },
      ctaKey: 'home.parent.actionOpenEventCta',
      accessibilityLabelKey: 'home.parent.actionOpenEventA11y',
      accessibilityLabelOptions: {
        child,
        title: event.title,
      },
    }
  }

  return {
    kind: 'empty-schedule',
    target: 'schedule',
    icon: 'calendar',
    tone: 'neutral',
    titleKey: 'home.parent.actionEmptyTitle',
    bodyKey: 'home.parent.actionEmptyBody',
    ctaKey: 'home.parent.actionOpenScheduleCta',
    accessibilityLabelKey: 'home.parent.actionOpenScheduleA11y',
  }
}

export function ParentHome() {
  const c = useClubColors()
  const { t, i18n } = useTranslation()
  const locale = i18n?.language ?? 'en'
  const [event, setEvent] = useState<ChildEvent | null>(null)
  const [upcoming, setUpcoming] = useState<ChildEvent[]>([])
  const [announcements, setAnnouncements] = useState<ChildAnnouncement[]>([])
  const [loaded, setLoaded] = useState(false)
  const [agenda, setAgenda] = useState<{
    kids: ConflictKid[]
    events: ConflictEvent[]
  } | null>(null)

  const load = useCallback(async () => {
    // /me/children-agenda was a separate endpoint that never landed —
    // build the {kids, events} agenda inline from /me/children-events
    // (which is real, see api/src/users/users.controller.ts:191) so the
    // home tile and conflict detector both work off the same source.
    // Also pull a wider window for the agenda (limit=20) than the
    // upcoming-strip needs (limit=5) so the conflict scanner sees enough
    // schedule overlap.
    const [evs, agendaEvs, anns] = await Promise.all([
      api<ChildEvent[]>('/me/children-events?limit=5').catch(() => []),
      api<ChildEvent[]>('/me/children-events?limit=20').catch(() => []),
      api<ChildAnnouncement[]>('/me/children-announcements?limit=3').catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setUpcoming(evs?.slice(1, 5) ?? [])
    setAnnouncements(anns ?? [])

    let nextAgenda: { kids: ConflictKid[]; events: ConflictEvent[] } | null = null
    const kidMap = new Map<string, ConflictKid>()
    const events: ConflictEvent[] = []
    for (const e of agendaEvs ?? []) {
      if (!e.childUserId) continue
      if (!kidMap.has(e.childUserId)) {
        kidMap.set(e.childUserId, {
          userId: e.childUserId,
          name: e.childName ?? 'Child',
          teamName: e.teamName,
        })
      }
      events.push({
        id: e.id,
        kidId: e.childUserId,
        title: e.title,
        date: e.date,
        location: e.location ?? null,
        rsvp: normalizeChildRsvp(e.childRsvp),
      })
    }
    if (kidMap.size > 0) {
      nextAgenda = { kids: Array.from(kidMap.values()), events }
    }
    setAgenda(nextAgenda)
    setLoaded(true)
  }, [])

  const conflicts = useMemo(() => {
    if (!agenda || !Array.isArray(agenda.kids) || agenda.kids.length < 2) {
      return []
    }
    if (!Array.isArray(agenda.events)) return []
    return findConflicts(agenda.events).sort((x, y) => x.daysAway - y.daysAway)
  }, [agenda])

  const nextConflict = conflicts[0] ?? null
  const parentAction = useMemo(
    () =>
      loaded
        ? getParentNextAction({
            event,
            conflictCount: conflicts.length,
            nextConflict,
            locale,
          })
        : null,
    [conflicts.length, event, loaded, locale, nextConflict],
  )
  const parentActionOwnsConflict = parentAction?.kind === 'conflict'
  const parentActionOwnsEvent =
    parentAction?.kind === 'today-event' || parentAction?.kind === 'next-event'
  const parentActionOwnsEmpty = parentAction?.kind === 'empty-schedule'

  const handleParentAction = useCallback(() => {
    if (!parentAction) return
    switch (parentAction.target) {
      case 'conflicts':
        router.push('/conflicts' as never)
        return
      case 'event':
        if (!parentAction.eventId) return
        router.push({
          pathname: '/event-detail',
          params: { eventId: parentAction.eventId },
        } as never)
        return
      case 'schedule':
        router.push('/parent-schedule' as never)
    }
  }, [parentAction])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      {parentAction ? (
        <ParentNextActionPanel
          action={parentAction}
          onPress={handleParentAction}
        />
      ) : null}

      {/* Conflict banner — pinned to top when overlaps detected */}
      {conflicts.length > 0 && !parentActionOwnsConflict ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.parent.conflictBanner', {
            defaultValue: '{{count}} schedule conflict(s)',
            count: conflicts.length,
          })}
          onPress={() => router.push('/conflicts' as never)}
          style={({ pressed }) => [
            styles.conflictBanner,
            elevation.card,
            {
              backgroundColor: withAlpha(c.error, 0.08),
              borderColor: withAlpha(c.error, 0.3),
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={[styles.conflictIcon, { backgroundColor: c.error }]}>
            <Icon name="exclamationmark.circle" size={14} color="inverse" />
          </View>
          <View style={styles.conflictBody}>
            <Text style={[styles.conflictEyebrow, { color: c.error }]}>
              {t('home.parent.conflictEyebrow', {
                defaultValue: 'CONFLICT SCANNER',
              })}
            </Text>
            <Text variant="footnote" color="primary" weight="semibold" numberOfLines={2}>
              {nextConflict
                ? t('home.parent.conflictHeadline', {
                    defaultValue:
                      '{{count}} overlap(s) — next in {{days}}d',
                    count: conflicts.length,
                    days: nextConflict.daysAway,
                  })
                : t('home.parent.conflictHeadlineGeneric', {
                    defaultValue: '{{count}} overlap(s) in the next 14 days',
                    count: conflicts.length,
                  })}
            </Text>
          </View>
          <Icon name="chevron.right" size={14} color="tertiary" />
        </Pressable>
      ) : null}

      {/* Hero — next event for child */}
      {event && !parentActionOwnsEvent ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/event-detail',
              params: { eventId: event.id },
            } as never)
          }
          accessibilityRole="button"
          accessibilityLabel={event.title}
          style={({ pressed }) => [
            styles.hero,
            elevation.hero,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.96 },
          ]}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {[event.teamDisplayName || event.teamName, formatEyebrow(event.date, locale)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.heroTitle}>
            {event.title}
          </Text>
          {event.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle" size={14} color="tertiary" />
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : loaded && !event && !parentActionOwnsEmpty ? (
        <EmptyCard
          message={t('home.parent.noEvents', {
            defaultValue: 'No events for your child right now.',
          })}
        />
      ) : null}

      {/* Upcoming list */}
      {upcoming.length > 0 ? (
        <>
          <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
            {t('home.parent.upcoming', { defaultValue: 'Upcoming' }).toUpperCase()}
          </Text>
          <View style={styles.list}>
            {upcoming.map((ev) => (
              <Pressable
                key={ev.id}
                onPress={() =>
                  router.push({
                    pathname: '/event-detail',
                    params: { eventId: ev.id },
                  } as never)
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  elevation.card,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                  pressed && { opacity: 0.96 },
                ]}
              >
                <View
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: c.surfaceSunken ?? c.background,
                      borderColor: c.borderDefault,
                    },
                  ]}
                >
                  <Text variant="caption2" color="secondary" style={styles.dayChipDow}>
                    {formatWeekday(ev.date, locale).toUpperCase()}
                  </Text>
                  <Text variant="callout" color="primary" weight="semibold" tabular>
                    {String(new Date(ev.date).getDate()).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text variant="callout" color="primary" numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text variant="caption2" color="secondary">
                    {ev.teamDisplayName || ev.teamName}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </Text>
                </View>
                <Icon name="chevron.right" size={14} color="tertiary" />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {/* Announcements */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.announcements', { defaultValue: 'Announcements' }).toUpperCase()}
      </Text>
      {announcements.length === 0 ? (
        <EmptyCard
          message={t('announcements.empty', { defaultValue: 'No announcements.' })}
        />
      ) : (
        <View style={styles.list}>
          {announcements.map((a) => (
            <View
              key={a.id}
              style={[styles.annRow, elevation.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                {a.title}
              </Text>
              <Text variant="footnote" color="secondary" numberOfLines={2}>
                {a.body}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function ParentNextActionPanel({
  action,
  onPress,
}: {
  action: ParentNextAction
  onPress: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const accent =
    action.tone === 'warning'
      ? c.warning
      : action.tone === 'neutral'
        ? c.textPrimary
        : c.primary
  const title = t(action.titleKey, action.titleOptions)
  const body = t(action.bodyKey, action.bodyOptions)
  const cta = t(action.ctaKey)
  const accessibilityLabel = t(
    action.accessibilityLabelKey,
    action.accessibilityLabelOptions,
  )

  return (
    <View
      style={[
        styles.actionPanel,
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <View style={styles.actionHeader}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: withAlpha(accent, 0.12) },
          ]}
        >
          <Icon name={action.icon} size={18} color={accent} />
        </View>
        <Text style={[styles.actionEyebrow, { color: c.textTertiary }]}>
          {t('home.parent.nextActionEyebrow', {
            defaultValue: 'FAMILY NEXT ACTION',
          })}
        </Text>
      </View>
      <Text
        variant="title3"
        weight="semibold"
        color="primary"
        numberOfLines={2}
        style={styles.actionTitle}
      >
        {title}
      </Text>
      <Text variant="footnote" color="secondary" numberOfLines={2}>
        {body}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: c.primary },
          pressed && { opacity: 0.86 },
        ]}
      >
        <Text style={[styles.actionButtonText, { color: c.textInverse }]} numberOfLines={1}>
          {cta}
        </Text>
        <Icon name="chevron.right" size={14} color="inverse" />
      </Pressable>
    </View>
  )
}

function EmptyCard({ message }: { message: string }) {
  const c = useClubColors()
  return (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="footnote" color="secondary">
        {message}
      </Text>
    </View>
  )
}

function formatWeekday(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short' })
}

function formatEyebrow(iso: string, locale: string): string {
  const d = new Date(iso)
  const dow = d.toLocaleDateString(locale, { weekday: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `${dow.toUpperCase()} · ${time}`
}

function formatActionWhen(iso: string, locale: string, nowMs: number): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (isSameLocalDay(iso, nowMs)) return time
  const day = d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return `${day} · ${time}`
}

function formatConflictWhen(daysAway: number, locale: string): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      daysAway,
      'day',
    )
  } catch {
    if (daysAway <= 0) return 'today'
    if (daysAway === 1) return 'tomorrow'
    return `in ${daysAway} days`
  }
}

function isSameLocalDay(iso: string, nowMs: number): boolean {
  const d = new Date(iso)
  const now = new Date(nowMs)
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function normalizeChildRsvp(value: ChildEvent['childRsvp']): ConflictEvent['rsvp'] {
  return value === 'YES' || value === 'MAYBE' || value === 'NO'
    ? value
    : 'PENDING'
}

const styles = StyleSheet.create({
  root: { gap: space.lg },

  actionPanel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.sm,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  actionTitle: {
    letterSpacing: -0.2,
    marginTop: space['2xs'],
  },
  actionEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  actionButton: {
    minHeight: 46,
    marginTop: space.xs,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  actionButtonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  conflictIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictBody: { flex: 1, gap: space['2xs'] },
  conflictEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  hero: {
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.sm,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: { letterSpacing: -0.3, marginTop: space['2xs'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: space.xs,
    marginBottom: -space.xs,
  },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipDow: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  rowBody: { flex: 1, gap: 1 },

  annRow: {
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space['2xs'],
  },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
})
