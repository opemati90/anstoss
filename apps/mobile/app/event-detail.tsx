import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
import { RSVP } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Icon, Screen, Text } from '../src/components/ui'
import { EventListSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { Haptics } from '../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  card,
  elevation,
  hairline,
  radius,
  space,
} from '../src/theme/tokens'

type RsvpUser = {
  id: string
  status: 'YES' | 'MAYBE' | 'NO'
  updatedAt: string
  user: { id: string; name: string; avatarUrl?: string | null }
}

type EventDetail = {
  id: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  location: string | null
  notes: string | null
  rsvps: RsvpUser[]
  team?: { id: string; name: string }
  yesCount?: number
  maybeCount?: number
  noCount?: number
  myRsvp?: 'YES' | 'MAYBE' | 'NO' | null
  reminderEnabled?: boolean
}

export default function EventDetailScreen() {
  const { t } = useTranslation()
  const { eventId } = useLocalSearchParams<{ eventId: string; teamId?: string }>()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rsvpPending, setRsvpPending] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderPending, setReminderPending] = useState(false)

  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rsvpScale = useRef(new Animated.Value(1)).current

  const rsvpOptions: Array<{
    status: 'YES' | 'MAYBE' | 'NO'
    labelKey: string
    color: string
  }> = [
    { status: 'YES', labelKey: 'event.rsvpYes', color: c.success },
    { status: 'MAYBE', labelKey: 'event.rsvpMaybe', color: c.warning },
    { status: 'NO', labelKey: 'event.rsvpNo', color: c.error },
  ]

  const fetchEvent = useCallback(async () => {
    if (!activeClub || !eventId) return
    setError(false)
    try {
      const data = await api<EventDetail>(
        `/clubs/${activeClub.club.id}/events/${eventId}`,
      )
      setEvent(data)
      setReminderEnabled(data.reminderEnabled ?? false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, eventId])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])

  const handleRsvp = useCallback(
    (status: string) => {
      if (!activeClub || !event || rsvpPending) return

      Haptics.tap()
      Animated.sequence([
        Animated.timing(rsvpScale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
        Animated.spring(rsvpScale, { toValue: 1, useNativeDriver: true }),
      ]).start()

      setEvent((prev) =>
        prev ? { ...prev, myRsvp: status as EventDetail['myRsvp'] } : prev,
      )

      if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
      rsvpTimer.current = setTimeout(async () => {
        setRsvpPending(true)
        try {
          await api(`/clubs/${activeClub.club.id}/events/${event.id}/rsvp`, {
            method: 'PUT',
            body: { status },
          })
          await fetchEvent()
        } catch {
          await fetchEvent()
        } finally {
          setRsvpPending(false)
        }
      }, RSVP.DEBOUNCE_MS)
    },
    [activeClub, event, rsvpPending, rsvpScale, fetchEvent],
  )

  const handleToggleReminder = useCallback(
    async (enabled: boolean) => {
      if (!activeClub || !event || reminderPending) return
      setReminderEnabled(enabled)
      setReminderPending(true)
      try {
        await api(`/clubs/${activeClub.club.id}/events/${event.id}/reminder`, {
          method: 'PUT',
          body: { enabled },
        })
      } catch {
        setReminderEnabled(!enabled)
      } finally {
        setReminderPending(false)
      }
    },
    [activeClub, event, reminderPending],
  )

  const isFutureEvent = event ? new Date(event.date) > new Date(Date.now() + 60 * 60 * 1000) : false

  if (loading) {
    return (
      <Screen
        header={<ModalHeader title={t('event.detailTitle')} />}
        padded={false}
      >
        <EventListSkeleton />
      </Screen>
    )
  }

  if (error || !event) {
    return (
      <Screen
        header={<ModalHeader title={t('event.detailTitle')} />}
        padded={false}
      >
        <View style={styles.centered}>
          <ErrorState
            message={t('event.loadError')}
            onRetry={fetchEvent}
            retryLabel={t('common.retry')}
          />
        </View>
      </Screen>
    )
  }

  const date = new Date(event.date)
  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  const formattedTime = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const yesCount = event.yesCount ?? event.rsvps?.filter((r) => r.status === 'YES').length ?? 0
  const maybeCount = event.maybeCount ?? event.rsvps?.filter((r) => r.status === 'MAYBE').length ?? 0
  const noCount = event.noCount ?? event.rsvps?.filter((r) => r.status === 'NO').length ?? 0

  const typeTint =
    event.type === 'TRAINING'
      ? c.info
      : event.type === 'MATCH'
        ? c.success
        : c.textTertiary

  return (
    <Screen
      header={<ModalHeader title={event.title} />}
      scroll
      padded={false}
    >
      <View style={styles.content}>
        {/* Hero card: date + time + location */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              ...elevation.card,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: hexWithAlpha(typeTint, 0.12) },
              ]}
            >
              <Text variant="caption2" weight="semibold" color={typeTint}>
                {t(`event.type.${event.type}`).toUpperCase()}
              </Text>
            </View>
            {event.team?.name ? (
              <Text variant="footnote" color="tertiary">
                {event.team.name}
              </Text>
            ) : null}
          </View>

          <Text variant="title1" color="primary" numberOfLines={3}>
            {event.title}
          </Text>

          <View style={styles.metaList}>
            <View style={styles.metaRow}>
              <Icon name="calendar.fill" size="sm" color="tertiary" />
              <Text variant="subheadline" color="secondary">
                {formattedDate}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Icon name="clock.fill" size="sm" color="tertiary" />
              <Text variant="subheadline" color="secondary" tabular>
                {formattedTime}
              </Text>
            </View>
            {event.location ? (
              <View style={styles.metaRow}>
                <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
                <Text variant="subheadline" color="secondary" numberOfLines={2}>
                  {event.location}
                </Text>
              </View>
            ) : null}
          </View>

          {event.notes ? (
            <View style={[styles.notesSection, { borderTopColor: c.border }]}>
              <Text variant="body" color="primary">
                {event.notes}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Remind me toggle — only for future events */}
        {isFutureEvent ? (
          <View
            style={[
              styles.reminderRow,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
              },
            ]}
          >
            <Icon name="bell.fill" size="md" color="tint" />
            <Text variant="body" color="primary" style={{ flex: 1 }}>
              {t('event.remindMe')}
            </Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              disabled={reminderPending}
              trackColor={{ false: c.border, true: c.clubPrimary }}
              thumbColor="#fff"
            />
          </View>
        ) : null}

        {/* RSVP buttons */}
        <View style={styles.sectionLabel}>
          <Text variant="caption2" color="tertiary" tracking="wide">
            {t('event.yourRsvp')?.toUpperCase() ?? 'RSVP'}
          </Text>
        </View>
        <Animated.View style={[styles.rsvpRow, { transform: [{ scale: rsvpScale }] }]}>
          {rsvpOptions.map((option) => {
            const isActive = event.myRsvp === option.status
            const bg = isActive ? option.color : hexWithAlpha(option.color, 0.12)
            const fg = isActive ? c.textInverse : option.color
            return (
              <Pressable
                key={option.status}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
                accessibilityHint={t('event.rsvpHint')}
                accessibilityState={{ selected: isActive, disabled: rsvpPending }}
                onPress={() => handleRsvp(option.status)}
                disabled={rsvpPending}
                style={({ pressed }) => [
                  styles.rsvpButton,
                  { backgroundColor: bg },
                  pressed && { opacity: 0.85 },
                  rsvpPending && { opacity: 0.6 },
                ]}
              >
                <Text variant="subheadline" weight="semibold" color={fg}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </Animated.View>

        {/* RSVP Breakdown */}
        <RsvpBreakdown
          rsvps={event.rsvps || []}
          yesCount={yesCount}
          maybeCount={maybeCount}
          noCount={noCount}
          eventId={event.id}
        />
      </View>
    </Screen>
  )
}

function RsvpBreakdown({
  rsvps,
  yesCount,
  maybeCount,
  noCount,
  eventId,
}: {
  rsvps: RsvpUser[]
  yesCount: number
  maybeCount: number
  noCount: number
  eventId: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [expandedSection, setExpandedSection] = useState<string | null>('YES')

  const rsvpSections: Array<{
    status: 'YES' | 'MAYBE' | 'NO'
    labelKey: string
    color: string
  }> = [
    { status: 'YES', labelKey: 'event.rsvpYes', color: c.success },
    { status: 'MAYBE', labelKey: 'event.rsvpMaybe', color: c.warning },
    { status: 'NO', labelKey: 'event.rsvpNo', color: c.error },
  ]

  const grouped = {
    YES: rsvps.filter((r) => r.status === 'YES'),
    MAYBE: rsvps.filter((r) => r.status === 'MAYBE'),
    NO: rsvps.filter((r) => r.status === 'NO'),
  }

  const counts = { YES: yesCount, MAYBE: maybeCount, NO: noCount }
  const totalResponses = yesCount + maybeCount + noCount

  const toggleSection = (status: string) => {
    setExpandedSection((prev) => (prev === status ? null : status))
  }

  return (
    <View style={styles.breakdownWrapper}>
      <View style={styles.sectionLabel}>
        <Text variant="caption2" color="tertiary" tracking="wide">
          {t('event.attendees')?.toUpperCase() ?? 'ATTENDEES'}
        </Text>
      </View>

      <View
        style={[
          styles.breakdownCard,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            ...elevation.card,
          },
        ]}
      >
        {/* Summary counts row */}
        <View style={[styles.breakdownCountsRow, { borderBottomColor: c.border }]}>
          {rsvpSections.map((section) => (
            <View key={section.status} style={styles.breakdownCountChip}>
              <View
                style={[styles.breakdownDot, { backgroundColor: section.color }]}
              />
              <Text variant="title3" weight="bold" color={section.color} tabular>
                {counts[section.status]}
              </Text>
              <Text variant="caption1" color="secondary">
                {t(section.labelKey)}
              </Text>
            </View>
          ))}
        </View>

        {totalResponses > 0 ? (
          rsvpSections.map((section, idx) => {
            const items = grouped[section.status]
            const isExpanded = expandedSection === section.status
            const isLast = idx === rsvpSections.length - 1

            return (
              <View key={section.status}>
                <Pressable
                  style={[
                    styles.breakdownSectionHeader,
                    !isLast && { borderBottomColor: c.border, borderBottomWidth: hairline },
                  ]}
                  onPress={() => toggleSection(section.status)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(section.labelKey)} ${counts[section.status]}`}
                >
                  <View style={styles.breakdownSectionLeft}>
                    <View
                      style={[styles.breakdownDot, { backgroundColor: section.color }]}
                    />
                    <Text variant="headline" color="primary">
                      {t(section.labelKey)}
                    </Text>
                    <Text variant="subheadline" color="tertiary" tabular>
                      {counts[section.status]}
                    </Text>
                  </View>
                  <Icon
                    name={isExpanded ? 'chevron.up' : 'chevron.down'}
                    size="sm"
                    color="tertiary"
                  />
                </Pressable>

                {isExpanded && items.length > 0 ? (
                  <View style={styles.breakdownMemberList}>
                    {items.map((rsvp) => (
                      <View key={rsvp.id} style={styles.breakdownMemberRow}>
                        <View
                          style={[
                            styles.breakdownAvatar,
                            { backgroundColor: c.clubPrimaryLight },
                          ]}
                        >
                          <Text
                            variant="subheadline"
                            weight="bold"
                            color={c.clubPrimary}
                          >
                            {(rsvp.user.name || '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text variant="body" color="primary" numberOfLines={1}>
                          {rsvp.user.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {isExpanded && items.length === 0 ? (
                  <View style={styles.breakdownEmpty}>
                    <Text variant="subheadline" color="tertiary">
                      {t('eventAttendance.noResponses')}
                    </Text>
                  </View>
                ) : null}
              </View>
            )
          })
        ) : (
          <View style={styles.breakdownEmpty}>
            <Text variant="subheadline" color="tertiary">
              {t('eventAttendance.noResponses')}
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.viewAttendanceRow, { borderTopColor: c.border }]}
          onPress={() =>
            router.push({
              pathname: '/event-attendance',
              params: { eventId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('event.viewAttendance')}
        >
          <Text variant="subheadline" weight="semibold" color={c.clubPrimary}>
            {t('event.viewAttendance')}
          </Text>
          <Icon name="chevron.right" size="sm" color={c.clubPrimary} />
        </Pressable>
      </View>
    </View>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  heroCard: {
    borderRadius: card.heroRadius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.paddingHero,
    gap: space.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  metaList: {
    gap: space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  notesSection: {
    marginTop: space.xs,
    paddingTop: space.md,
    borderTopWidth: hairline,
  },

  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sectionLabel: {
    paddingHorizontal: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },

  // RSVP buttons
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  rsvpButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  breakdownWrapper: {
    gap: 0,
  },
  breakdownCard: {
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  breakdownCountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
  },
  breakdownCountChip: {
    flex: 1,
    alignItems: 'center',
    gap: space['2xs'],
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  breakdownSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: space.md,
  },
  breakdownSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  breakdownMemberList: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  breakdownMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  breakdownAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownEmpty: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  viewAttendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: space.md,
    borderTopWidth: hairline,
  },
})
