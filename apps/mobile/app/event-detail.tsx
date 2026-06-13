import { SPACING_XS, SPACING_MD } from '../src/theme/spacing';
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
import { AttendanceSheet } from '../src/components/events/AttendanceSheet'
import { UnavailableReasonSheet } from '../src/components/events/UnavailableReasonSheet'
import { RSVP } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
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
  reason?: string | null
  user: { id: string; name: string; avatarUrl?: string | null }
}

type EventDetail = {
  id: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  location: string | null
  notes: string | null
  cancelledAt: string | null
  rsvps: RsvpUser[]
  team?: { id: string; name: string }
  yesCount?: number
  maybeCount?: number
  noCount?: number
  myRsvp?: 'YES' | 'MAYBE' | 'NO' | null
  reminderEnabled?: boolean
  lastRsvpReminderAt?: string | null
  teamMemberCount?: number | null
  myCheckInAt?: string | null
}

export default function EventDetailScreen() {
  const { t } = useTranslation()
  const { eventId } = useLocalSearchParams<{ eventId: string; teamId?: string }>()
  const { activeClub, teamMembers } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rsvpPending, setRsvpPending] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderPending, setReminderPending] = useState(false)

  // RSVP reminder (admin/coach only)
  const [remindedAt, setRemindedAt] = useState<string | null>(null)
  const [remindedCount, setRemindedCount] = useState<number | null>(null)
  const [reminding, setReminding] = useState(false)

  // Check-in (player only)
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const checkingInRef = useRef(false)

  // Attendance sheet (coach/admin only)
  const [attendanceSheetVisible, setAttendanceSheetVisible] = useState(false)

  // Reason sheet — shown when user taps "No"
  const [reasonSheetVisible, setReasonSheetVisible] = useState(false)

  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rsvpScale = useRef(new Animated.Value(1)).current
  const remindingRef = useRef(false)

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
    if (!activeClub || !eventId) {
      // Without club context or event id we can't fetch — stop showing the
      // skeleton, surface an error empty state instead.
      setLoading(false)
      setError(true)
      return
    }
    setError(false)
    try {
      const data = await api<EventDetail>(
        `/clubs/${activeClub.club.id}/events/${eventId}`,
      )
      setEvent(data)
      setReminderEnabled(data.reminderEnabled ?? false)
      if (data.lastRsvpReminderAt) {
        setRemindedAt(data.lastRsvpReminderAt)
      }
      if (data.myCheckInAt !== undefined) {
        setCheckedInAt(data.myCheckInAt ?? null)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, eventId])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])

  const submitRsvp = useCallback(
    async (status: string, reason?: string) => {
      if (!activeClub || !event) return
      setRsvpPending(true)
      try {
        const body: { status: string; reason?: string } = { status }
        if (reason !== undefined) body.reason = reason
        await api(`/clubs/${activeClub.club.id}/events/${event.id}/rsvp`, {
          method: 'PUT',
          body,
        })
        await fetchEvent()
      } catch {
        await fetchEvent()
      } finally {
        setRsvpPending(false)
      }
    },
    [activeClub, event, fetchEvent],
  )

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

      if (status === 'NO') {
        // Show reason picker before submitting — the sheet callbacks will call submitRsvp
        if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
        setReasonSheetVisible(true)
        return
      }

      if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
      rsvpTimer.current = setTimeout(async () => {
        await submitRsvp(status)
      }, RSVP.DEBOUNCE_MS)
    },
    [activeClub, event, rsvpPending, rsvpScale, submitRsvp],
  )

  const handleReasonSelect = useCallback(
    (reason: string) => {
      setReasonSheetVisible(false)
      void submitRsvp('NO', reason)
    },
    [submitRsvp],
  )

  const handleReasonSkip = useCallback(() => {
    setReasonSheetVisible(false)
    void submitRsvp('NO')
  }, [submitRsvp])

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

  // Fix 4: use the event's own team membership — not the globally selected team.
  // A coach on Team A must not see the remind button for Team B's event.
  const eventTeamAccess = teamMembers.find((m) => m.team.id === event?.team?.id)
  const canManage =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    (eventTeamAccess != null &&
      ['HEAD_COACH', 'ASSISTANT_COACH', 'COACH'].includes(eventTeamAccess.role))

  // Player check-in: only PLAYER role on the event's team (not coaches/admins)
  const isPlayer =
    !canManage &&
    eventTeamAccess != null &&
    eventTeamAccess.role === 'PLAYER'

  // Check-in window: 2h before → 3h after event start
  const isInCheckInWindow = event
    ? (() => {
        const eventMs = new Date(event.date).getTime()
        const now = Date.now()
        return now >= eventMs - 2 * 60 * 60 * 1000 && now <= eventMs + 3 * 60 * 60 * 1000
      })()
    : false

  const handleCheckIn = useCallback(async () => {
    if (checkingInRef.current || !activeClub || !event || checkedInAt) return
    checkingInRef.current = true
    setCheckingIn(true)
    try {
      const res = await api<{ checkedInAt: string }>(
        `/clubs/${activeClub.club.id}/events/${event.id}/check-in`,
        { method: 'POST' },
      )
      setCheckedInAt(res.checkedInAt)
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'status' in err
        ? (err as { status: number }).status
        : 0
      if (status === 400 || status === 409) {
        Alert.alert(t('common.errorTitle'), t('event.checkIn.windowClosed'))
      } else {
        Alert.alert(t('common.errorTitle'), t('common.error'))
      }
    } finally {
      checkingInRef.current = false
      setCheckingIn(false)
    }
  }, [activeClub, event, checkedInAt, t])

  const isReminderInCooldown =
    remindedAt != null &&
    Date.now() < new Date(remindedAt).getTime() + 24 * 60 * 60 * 1000

  const handleRemind = useCallback(async () => {
    // Fix 6: ref guard prevents double-submission from rapid taps
    if (remindingRef.current || !activeClub || !event || isReminderInCooldown) return
    remindingRef.current = true
    setReminding(true)
    try {
      const res = await api<{ sent: number; nextAvailableAt: string }>(
        `/clubs/${activeClub.club.id}/events/${event.id}/remind-rsvp`,
        { method: 'POST' },
      )
      // Fix 2: use the nextAvailableAt the server returns so cooldown is exact
      setRemindedAt(res.nextAvailableAt ?? new Date().toISOString())
      setRemindedCount(res.sent)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        // Fix 2: read retryAfter from the parsed 429 body (ApiError.data carries the raw response).
        // Falls back to a conservative 24h lockout if the server doesn't include retryAfter.
        const body = err.data as Record<string, unknown> | null | undefined
        const retryAfter =
          (typeof body?.retryAfter === 'string' ? body.retryAfter : null)
          ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        setRemindedAt(retryAfter)
      } else {
        // Fix 5: surface unexpected errors — don't silently swallow 403 or 5xx
        Alert.alert(t('common.errorTitle'), t('event.rsvpReminderError'))
      }
    } finally {
      remindingRef.current = false
      setReminding(false)
    }
  }, [activeClub, event, isReminderInCooldown, t])

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

  // Fix 1: non-responder count for button label.
  // Use teamMemberCount from API when available; fall back to rsvps array length
  // (which only covers responded members — so nonResponderCount would be 0 as a safe fallback).
  const respondedCount = yesCount + maybeCount + noCount
  const totalMembers = event.teamMemberCount ?? null
  const nonResponderCount = totalMembers != null ? Math.max(0, totalMembers - respondedCount) : null

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
              borderColor: c.borderDefault,
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
              <Text variant="footnote" weight="semibold" color={typeTint}>
                {t(`event.type.${event.type}`)}
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
            <View style={[styles.notesSection, { borderTopColor: c.borderDefault }]}>
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
                borderColor: c.borderDefault,
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
              trackColor={{ false: c.borderDefault, true: c.primary }}
              thumbColor={c.textInverse}
              accessibilityRole="switch"
              accessibilityLabel={t('event.remindMe')}
              accessibilityState={{ checked: reminderEnabled, disabled: reminderPending }}
            />
          </View>
        ) : null}

        <View style={styles.sectionLabel}>
          <Text variant="headline" weight="semibold" color="primary">
            {t('event.yourRsvp')}
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

        {/* Remind non-responders — admin/coach + future + not cancelled */}
        {canManage && isFutureEvent && !event.cancelledAt ? (
          <RsvpReminderRow
            remindedAt={remindedAt}
            remindedCount={remindedCount}
            reminding={reminding}
            isInCooldown={isReminderInCooldown}
            nonResponderCount={nonResponderCount}
            onRemind={handleRemind}
          />
        ) : null}

        {/* Player check-in row — only for PLAYER role, within check-in window or already checked in */}
        {isPlayer && (isInCheckInWindow || checkedInAt) ? (
          <CheckInRow
            checkedInAt={checkedInAt}
            pending={checkingIn}
            onCheckIn={handleCheckIn}
          />
        ) : null}

        {/* Attendance summary — coach/admin only, when window is open or event has passed */}
        {canManage && !isFutureEvent ? (
          <AttendanceSummaryRow
            onOpen={() => setAttendanceSheetVisible(true)}
          />
        ) : null}

        {activeClub && event ? (
          <AttendanceSheet
            visible={attendanceSheetVisible}
            onClose={() => setAttendanceSheetVisible(false)}
            clubId={activeClub.club.id}
            eventId={event.id}
            eventDate={event.date}
          />
        ) : null}

        <UnavailableReasonSheet
          visible={reasonSheetVisible}
          onSelect={handleReasonSelect}
          onSkip={handleReasonSkip}
          onClose={() => {
            setReasonSheetVisible(false)
            // Revert optimistic update if user dismisses without selecting
            void fetchEvent()
          }}
        />
      </View>
    </Screen>
  )
}

function RsvpReminderRow({
  remindedAt,
  remindedCount,
  reminding,
  isInCooldown,
  nonResponderCount,
  onRemind,
}: {
  remindedAt: string | null
  remindedCount: number | null
  reminding: boolean
  isInCooldown: boolean
  nonResponderCount: number | null
  onRemind: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  const isDisabled = reminding || isInCooldown

  // Fix 3: compute "X ago" suffix for cooldown label
  let agoText = ''
  if (isInCooldown && remindedAt) {
    const msAgo = Date.now() - new Date(remindedAt).getTime()
    const minsAgo = Math.floor(msAgo / 60000)
    agoText = minsAgo < 2
      ? t('common.relative.justNow')
      : minsAgo < 60
        ? t('common.relative.minsAgo', { count: minsAgo })
        : t('common.relative.hoursAgo', { count: Math.floor(minsAgo / 60) })
  }

  // Fix 1 + Fix 3: build button label
  let buttonLabel: string
  if (isInCooldown && remindedCount != null) {
    const base = t('event.rsvpReminderSentCount', { count: remindedCount })
    buttonLabel = agoText ? `${base} · ${agoText}` : base
  } else if (isInCooldown) {
    buttonLabel = agoText
      ? t('event.rsvpReminderSentNoCount') + ` · ${agoText}`
      : t('event.rsvpReminderSentNoCount')
  } else if (nonResponderCount != null && nonResponderCount > 0) {
    // Fix 1: show count of non-responders
    buttonLabel = t('event.rsvpRemindNPeople', { count: nonResponderCount })
  } else {
    buttonLabel = t('event.rsvpRemindNow')
  }

  const buttonBg = isDisabled
    ? hexWithAlpha(c.primary, 0.35)
    : c.primary

  return (
    <View
      style={[
        styles.reminderRow,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
        },
      ]}
    >
      <Icon name="bell.badge.fill" size="md" color="tint" />
      <Text variant="body" color="secondary" style={{ flex: 1 }}>
        {isInCooldown
          ? t('event.rsvpReminderCooldownHint')
          : t('event.rsvpReminderHint')}
      </Text>
      <Pressable
        onPress={onRemind}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityState={{ disabled: isDisabled }}
        style={({ pressed }) => [
          styles.remindButton,
          { backgroundColor: buttonBg },
          pressed && !isDisabled && { opacity: 0.85 },
        ]}
      >
        <Text variant="footnote" weight="semibold" color={c.textInverse}>
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  )
}

function CheckInRow({
  checkedInAt,
  pending,
  onCheckIn,
}: {
  checkedInAt: string | null
  pending: boolean
  onCheckIn: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  const isCheckedIn = checkedInAt != null
  const isDisabled = pending || isCheckedIn

  const formattedTime = checkedInAt
    ? new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(checkedInAt))
    : null

  const buttonBg = isCheckedIn
    ? hexWithAlpha(c.success, 0.12)
    : isDisabled
      ? hexWithAlpha(c.primary, 0.35)
      : c.primary

  const buttonFg = isCheckedIn ? c.success : c.textInverse

  return (
    <View
      style={[
        styles.reminderRow,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
        },
      ]}
    >
      <Icon
        name={isCheckedIn ? 'checkmark.circle.fill' : 'qrcode'}
        size="md"
        color={isCheckedIn ? 'success' : 'tint'}
      />
      <Text variant="body" color="secondary" style={{ flex: 1 }}>
        {isCheckedIn
          ? t('event.checkIn.checkedInAt', { time: formattedTime })
          : t('event.checkIn.button')}
      </Text>
      {!isCheckedIn ? (
        <Pressable
          onPress={onCheckIn}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('event.checkIn.button')}
          accessibilityState={{ disabled: isDisabled }}
          style={({ pressed }) => [
            styles.remindButton,
            { backgroundColor: buttonBg },
            pressed && !isDisabled && { opacity: 0.85 },
          ]}
        >
          <Text variant="footnote" weight="semibold" color={buttonFg}>
            {pending ? '...' : t('event.checkIn.button')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function AttendanceSummaryRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('event.checkIn.attendanceTitle')}
      style={({ pressed }) => [
        styles.reminderRow,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon name="person.2.fill" size="md" color="tint" />
      <Text variant="body" color="primary" style={{ flex: 1 }}>
        {t('event.checkIn.attendanceTitle')}
      </Text>
      <Icon name="chevron.right" size="sm" color="tertiary" />
    </Pressable>
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
        <Text variant="headline" weight="semibold" color="primary">
          {t('event.attendees')}
        </Text>
      </View>

      <View
        style={[
          styles.breakdownCard,
          {
            backgroundColor: c.surface,
            borderColor: c.borderDefault,
            ...elevation.card,
          },
        ]}
      >
        {/* Summary counts row */}
        <View style={[styles.breakdownCountsRow, { borderBottomColor: c.borderDefault }]}>
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
                    !isLast && { borderBottomColor: c.borderDefault, borderBottomWidth: hairline },
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
                            { backgroundColor: c.primary50 },
                          ]}
                        >
                          <Text
                            variant="subheadline"
                            weight="bold"
                            color={c.primary}
                          >
                            {(rsvp.user.name || '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text variant="body" color="primary" numberOfLines={1} style={{ flex: 1 }}>
                          {rsvp.user.name}
                        </Text>
                        {rsvp.status === 'NO' && rsvp.reason ? (
                          <View
                            style={[
                              styles.breakdownReasonBadge,
                              { backgroundColor: c.borderDefault },
                            ]}
                          >
                            <Text variant="caption1" color="tertiary" numberOfLines={1}>
                              {rsvp.reason.length > 15
                                ? `${rsvp.reason.slice(0, 15)}…`
                                : rsvp.reason}
                            </Text>
                          </View>
                        ) : null}
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
          style={[styles.viewAttendanceRow, { borderTopColor: c.borderDefault }]}
          onPress={() =>
            router.push({
              pathname: '/event-attendance',
              params: { eventId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('event.viewAttendance')}
        >
          <Text variant="subheadline" weight="semibold" color={c.primary}>
            {t('event.viewAttendance')}
          </Text>
          <Icon name="chevron.right" size="sm" color={c.primary} />
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
    gap: space.lg,
  },
  heroCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.padding,
    gap: space.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: SPACING_XS,
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
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space['2xs'],
  },
  sectionLabel: {
    paddingHorizontal: space['2xs'],
    paddingTop: space.md,
    paddingBottom: space.sm,
  },

  // RSVP buttons
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  rsvpButton: {
    flex: 1,
    height: 48,
    borderRadius: SPACING_MD,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  remindButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  breakdownWrapper: {
    gap: 0,
  },
  breakdownCard: {
    borderRadius: radius.md,
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
  breakdownReasonBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    maxWidth: 120,
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
