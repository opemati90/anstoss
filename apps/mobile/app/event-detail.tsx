import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
import { RSVP, type EventDetail } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { BottomSheet, Button, Icon, ListRow, SectionGroup, SegmentedControl, Text } from '../src/components/ui'
import { Skeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { FormInput } from '../src/components/FormInput'
import { AttendanceSheet } from '../src/components/events/AttendanceSheet'
import { CarpoolBoard, type CarpoolRider } from '../src/components/events/CarpoolBoard'
import { EventHeaderCard } from '../src/components/events/EventHeaderCard'
import { ResponsesPanel } from '../src/components/events/ResponsesPanel'
import {
  RsvpControl,
  type AbsenceDetail,
  type RsvpStatus,
} from '../src/components/events/RsvpControl'
import { SquadPanel } from '../src/components/events/SquadPanel'
import { AvailabilityPolicySection } from '../src/components/events/AvailabilityPolicySection'
import { useAvailabilityClosed } from '../src/hooks/useAvailabilityClosed'
import { eventDisplayTitle, eventTimeLine, reasonLabel } from '../src/components/events/eventFormat'
import { Haptics } from '../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { hairline, radius, space } from '../src/theme/tokens'

type Segment = 'responses' | 'squad' | 'rides'

const CHECK_IN_BEFORE_MS = 2 * 60 * 60 * 1000
const CHECK_IN_AFTER_MS = 3 * 60 * 60 * 1000

/**
 * The one event screen. Header (what, when, where), the viewer's own answer,
 * then Zusagen · Kader · Fahrten. Coaches find edit / duplicate / share /
 * cancel in the header menu; the live ticker and table live one tap away on
 * match-detail for imported fixtures.
 */
export default function EventDetailScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const params = useLocalSearchParams<{
    eventId?: string | string[]
    attendance?: string | string[]
    cancel?: string | string[]
    tab?: string | string[]
  }>()
  const eventId = first(params.eventId)
  const { activeClub, user } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const currentScope = useRef({ key: '', generation: 0 })
  if (currentScope.current.key !== `${clubId}:${eventId}`) {
    currentScope.current = { key: `${clubId}:${eventId}`, generation: currentScope.current.generation + 1 }
  }

  const [event, setEvent] = useState<(EventDetail & { rsvpDeadline?: string | null; rsvpLocked?: boolean }) | null>(null)
  const availabilityIsClosed = useAvailabilityClosed(event)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [segment, setSegment] = useState<Segment>(() =>
    first(params.tab) === 'rides' ? 'rides' : first(params.tab) === 'squad' ? 'squad' : 'responses',
  )
  const [pendingRsvp, setPendingRsvp] = useState<string | null>(null)
  const rsvpRequestId = useRef(0)
  const rsvpInFlight = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelScope, setCancelScope] = useState<'this' | 'following'>('this')
  const [cancelling, setCancelling] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [reminding, setReminding] = useState(false)
  const reminderAttempt = useRef<object | null>(null)
  const [remindCooldown, setRemindCooldown] = useState<string | null>(null)
  const [remindSent, setRemindSent] = useState<number | null>(null)
  const [remindUncertain, setRemindUncertain] = useState(0)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null)
  const [reminderOn, setReminderOn] = useState(false)
  const seq = useRef(0)
  const deepLinksHandled = useRef<string | null>(null)

  const fetchEvent = useCallback(async () => {
    const request = ++seq.current
    if (!clubId || !eventId) {
      setError(true)
      return
    }
    try {
      const data = await api<EventDetail>(`/clubs/${clubId}/events/${eventId}`)
      if (seq.current !== request) return
      setEvent(data)
      setError(false)
      setCheckedInAt(data.myCheckInAt ?? null)
      setReminderOn(Boolean(data.reminderEnabled))
      setRemindCooldown(data.lastRsvpReminderAt
        ? new Date(new Date(data.lastRsvpReminderAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null)
    } catch {
      if (seq.current !== request) return
      setError(true)
    }
  }, [clubId, eventId])

  useEffect(() => {
    setEvent(null)
    setError(false)
    setPendingRsvp(null)
    ++rsvpRequestId.current
    rsvpInFlight.current = false
    reminderAttempt.current = null
    setReminding(false)
    setRemindCooldown(null)
    setRemindSent(null)
    setRemindUncertain(0)
    void fetchEvent()
    return () => { ++seq.current }
  }, [fetchEvent])

  // Deep links from home / pushes: ?attendance=1 opens the attendance sheet,
  // ?cancel=1 the cancel sheet — once per event.
  useEffect(() => {
    if (!event || !event.viewer.canManage || deepLinksHandled.current === event.id) return
    deepLinksHandled.current = event.id
    if (first(params.cancel) === '1' && !event.cancelledAt) setCancelOpen(true)
    else if (isTruthy(first(params.attendance)) && !event.cancelledAt) setAttendanceOpen(true)
  }, [event, params.attendance, params.cancel])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchEvent()
    } finally {
      setRefreshing(false)
    }
  }

  const submitRsvp = async (
    status: RsvpStatus,
    absence: AbsenceDetail | undefined,
    childUserId: string | null,
  ) => {
    if (!clubId || !event) return
    const key = childUserId ?? 'self'
    if (rsvpInFlight.current || availabilityIsClosed) return
    rsvpInFlight.current = true
    const requestId = ++rsvpRequestId.current
    setPendingRsvp(key)
    Haptics.tap()
    const snapshot = event
    setEvent((current) =>
      current
        ? childUserId
          ? {
              ...current,
              children: current.children.map((child) =>
                child.userId === childUserId
                  ? {
                      ...child,
                      rsvp: status,
                      reason: absence?.reason ?? null,
                      note: absence?.note ?? null,
                    }
                  : child,
              ),
            }
          : {
              ...current,
              myRsvp: status,
              myRsvpStale: false,
              myRsvpReason: status === 'NO' ? (absence?.reason ?? null) : null,
              myRsvpNote: absence?.note ?? null,
            }
        : current,
    )
    try {
      await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
      if (rsvpRequestId.current !== requestId || currentScope.current.key !== `${clubId}:${snapshot.id}`) return
      await api(`/clubs/${clubId}/events/${event.id}/rsvp`, {
        method: 'PUT',
        body: {
          status,
          ...(status === 'NO' ? absence : {}),
          ...(childUserId ? { childUserId } : {}),
        },
      })
      if (rsvpRequestId.current !== requestId || currentScope.current.key !== `${clubId}:${snapshot.id}`) return
      Haptics.success()
      void fetchEvent()
    } catch (error) {
      if (rsvpRequestId.current !== requestId || currentScope.current.key !== `${clubId}:${snapshot.id}`) return
      setEvent((current) => {
        if (!current || current.id !== snapshot.id || current.clubId !== snapshot.clubId) return current
        if (childUserId) return { ...current, children: current.children.map((child) => child.userId === childUserId
          ? (snapshot.children.find((before) => before.userId === childUserId) ?? child) : child) }
        return { ...current, myRsvp: snapshot.myRsvp, myRsvpStale: snapshot.myRsvpStale,
          myRsvpReason: snapshot.myRsvpReason, myRsvpNote: snapshot.myRsvpNote }
      })
      Haptics.fail()
      if (error instanceof ApiError && error.code === 'RSVP_LOCKED') {
        Alert.alert(t('eventFlow.availability.closed'), t('eventFlow.availability.closedHint'))
        void fetchEvent()
      } else Alert.alert(t('eventFlow.rsvp.failedTitle'), t('eventFlow.rsvp.failedBody'))
    } finally {
      if (rsvpRequestId.current === requestId) {
        rsvpInFlight.current = false
        setPendingRsvp(null)
      }
    }
  }

  const remind = async () => {
    if (!clubId || !event || reminderAttempt.current || availabilityIsClosed) return
    const scope = currentScope.current
    const attempt = {}
    reminderAttempt.current = attempt
    setReminding(true)
    try {
      const res = await api<{ sent: number; uncertain?: number; nextAvailableAt: string | null }>(
        `/clubs/${clubId}/events/${event.id}/remind-rsvp`,
        { method: 'POST' },
      )
      if (currentScope.current !== scope) return
      ++seq.current
      // A zero-delivery attempt can still encounter a previous real cooldown.
      // The server returns null when none is active.
      setRemindCooldown(res.nextAvailableAt)
      setRemindSent(res.sent)
      setRemindUncertain(res.uncertain ?? 0)
      if (res.sent > 0) Haptics.success()
    } catch (err) {
      if (currentScope.current !== scope) return
      if (err instanceof ApiError && err.status === 429 && err.code === 'RSVP_REMINDER_COOLDOWN'
          && reminderCooldownFromError(err.data)) {
        // Prevent an older GET from removing the newer, server-confirmed limit.
        ++seq.current
        setRemindCooldown(reminderCooldownFromError(err.data))
        setRemindSent(null)
        setRemindUncertain(0)
      } else if (err instanceof ApiError && err.code === 'RSVP_LOCKED') {
        void fetchEvent()
      } else {
        Alert.alert(
          t('eventFlow.responses.remindFailedTitle'),
          t('eventFlow.responses.remindFailedBody'),
        )
      }
    } finally {
      if (reminderAttempt.current === attempt) {
        reminderAttempt.current = null
        setReminding(false)
      }
    }
  }

  const checkIn = async () => {
    if (!clubId || !event || checkingIn || checkedInAt) return
    setCheckingIn(true)
    try {
      const res = await api<{ checkedInAt: string }>(
        `/clubs/${clubId}/events/${event.id}/check-in`,
        { method: 'POST' },
      )
      setCheckedInAt(res.checkedInAt)
      Haptics.success()
    } catch {
      Alert.alert(t('eventFlow.checkIn.failedTitle'), t('eventFlow.checkIn.failedBody'))
    } finally {
      setCheckingIn(false)
    }
  }

  const toggleReminder = async (enabled: boolean) => {
    if (!clubId || !event) return
    setReminderOn(enabled)
    try {
      await api(`/clubs/${clubId}/events/${event.id}/reminder`, {
        method: 'PUT',
        body: { enabled },
      })
    } catch {
      setReminderOn(!enabled)
    }
  }

  const share = async () => {
    if (!event) return
    setMenuOpen(false)
    const lines = [
      eventDisplayTitle(event, t),
      new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(event.date),
      ),
      eventTimeLine(event, locale, t),
      event.meetingPoint ? `${t('eventFlow.detail.meetingPoint')}: ${event.meetingPoint}` : null,
      event.location,
    ].filter(Boolean)
    try {
      await Share.share({ message: lines.join('\n') })
    } catch {
      // The share sheet was dismissed.
    }
  }

  const confirmCancel = async () => {
    if (!clubId || !event || cancelling) return
    setCancelling(true)
    try {
      const reason = cancelReason.trim()
      await api(`/clubs/${clubId}/events/${event.id}`, {
        method: 'DELETE',
        body: { ...(reason ? { reason } : {}), ...(event.seriesId ? { scope: cancelScope } : {}) },
      })
      setCancelOpen(false)
      setCancelReason('')
      Haptics.success()
      void fetchEvent()
    } catch {
      Alert.alert(t('eventFlow.manage.cancelFailedTitle'), t('eventFlow.manage.cancelFailedBody'))
    } finally {
      setCancelling(false)
    }
  }

  // Fahrten only when the coach opened them; the API refuses seats otherwise.
  const showRides = Boolean(event?.carpoolEnabled)
  const showSquad = event?.type === 'MATCH'
  const segments = useMemo(() => {
    const list: Array<{ key: Segment; label: string }> = [
      { key: 'responses', label: t('eventFlow.detail.tabResponses') },
    ]
    if (showSquad) list.push({ key: 'squad', label: t('eventFlow.detail.tabSquad') })
    if (showRides) list.push({ key: 'rides', label: t('eventFlow.detail.tabRides') })
    return list
  }, [showRides, showSquad, t])
  const activeSegment = segments.some((item) => item.key === segment) ? segment : 'responses'

  const riders: CarpoolRider[] = useMemo(() => {
    if (!event) return []
    if (event.children.length > 0) {
      return event.children.map((child) => ({ userId: child.userId, name: firstName(child.name) }))
    }
    return user ? [{ userId: user.id, name: firstName(user.name) }] : []
  }, [event, user])

  const title = event ? eventDisplayTitle(event, t) : t('eventFlow.detail.title')

  if (!event) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ModalHeader mode="back" title={t('eventFlow.detail.title')} />
        {error ? (
          <View style={styles.centered}>
            <ErrorState
              message={t('eventFlow.detail.loadError')}
              onRetry={() => void fetchEvent()}
              retryLabel={t('eventFlow.retry')}
            />
          </View>
        ) : (
          <View style={styles.content}>
            <Skeleton shape="card" height={280} />
            <Skeleton shape="card" height={96} />
            <Skeleton shape="card" height={48} />
            <Skeleton shape="card" height={200} />
          </View>
        )}
      </View>
    )
  }

  const nowMs = Date.now()
  const startMs = new Date(event.date).getTime()
  const cancelled = Boolean(event.cancelledAt)
  const started = nowMs >= startMs
  const canManage = event.viewer.canManage && !event.archivedAt
  // Everyone who plays answers for themselves, including a Spielertrainer or
  // a board member who plays; a parent who also plays gets both their own
  // answer and one per child.
  const answersForSelf = event.viewer.isPlayer
  const answersForChildren = event.children.length > 0
  const inCheckInWindow =
    nowMs >= startMs - CHECK_IN_BEFORE_MS && nowMs <= startMs + CHECK_IN_AFTER_MS
  const showCheckIn =
    event.viewer.isPlayer && !cancelled && inCheckInWindow && event.myRsvp !== 'NO'
  const nominatedPublished = Boolean(event.squadPublishedAt)

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        mode="back"
        title={title}
        rightAction={
          canManage && !cancelled ? (
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('eventFlow.manage.menu')}
              hitSlop={8}
              style={styles.menuButton}
              testID="event-manage-menu"
            >
              <Icon name="ellipsis.circle" size="lg" color="primary" />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <EventHeaderCard event={event} locale={locale} />

        {!cancelled && !started && !event.archivedAt ? <AvailabilityPolicySection key={`${clubId}:${event.id}`}
          policy={event} closed={availabilityIsClosed} canManage={canManage}
          onChange={async (change) => {
            const visit = currentScope.current
            const updated = await api<{ deadline: string | null; locked: boolean }>(`/clubs/${clubId}/events/${event.id}/availability-policy`, { method: 'PATCH', body: change })
            if (typeof updated.locked !== 'boolean' || (updated.deadline !== null && !Number.isFinite(Date.parse(updated.deadline)))) throw new Error('Invalid availability policy')
            if (currentScope.current !== visit || visit.key !== `${clubId}:${event.id}`) return
            // A GET started before this commit must not reopen availability.
            ++seq.current
            setEvent((current) => current?.id === event.id && current.clubId === clubId
              ? { ...current, rsvpDeadline: updated.deadline, rsvpLocked: updated.locked } : current)
          }} /> : null}

        {!cancelled && !started && answersForSelf ? (
          <SectionGroup header={t('eventFlow.detail.yourAnswer')}>
            <View style={styles.cardBody} testID="event-self-answer">
              {nominatedPublished && event.myNominated ? (
                <View style={styles.inlineTag}>
                  <Icon name="checkmark.circle.fill" size={16} color={c.primary} />
                  <Text variant="footnote" weight="semibold" color="tint">
                    {t('eventFlow.detail.inSquad')}
                  </Text>
                </View>
              ) : null}
              {event.myRsvpStale ? (
                <Text variant="footnote" color="tint">
                  {t('eventFlow.detail.rescheduled')}
                </Text>
              ) : null}
              <RsvpControl
                value={event.myRsvpStale ? null : event.myRsvp}
                onChange={(status, absence) => void submitRsvp(status, absence, null)}
                disabled={pendingRsvp != null || availabilityIsClosed}
                testID="event-rsvp"
              />
              {event.myRsvp === 'NO' && (event.myRsvpReason || event.myRsvpNote) ? (
                <Text variant="footnote" color="secondary">
                  {[reasonLabel(event.myRsvpReason, t), event.myRsvpNote]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
              <View style={[styles.switchRow, { borderTopColor: c.borderSubtle }]}>
                <Icon name="bell" size={18} color="secondary" />
                <Text variant="body" color="primary" style={styles.flex}>
                  {t('eventFlow.detail.remindMe')}
                </Text>
                <Switch
                  value={reminderOn}
                  onValueChange={(value) => void toggleReminder(value)}
                  trackColor={{ true: c.primary, false: c.borderStrong }}
                  accessibilityLabel={t('eventFlow.detail.remindMe')}
                />
              </View>
            </View>
          </SectionGroup>
        ) : null}

        {!cancelled && !started && answersForChildren ? (
          <View testID="event-child-answers">
            <SectionGroup header={t('eventFlow.detail.childAnswers')}>
              {event.children.map((child) => (
                <View key={child.userId} style={[styles.cardBody, styles.childRow]}>
                  <View style={styles.childHead}>
                    <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={1}>
                      {[firstName(child.name), child.teamName].filter(Boolean).join(' · ')}
                    </Text>
                    {nominatedPublished && child.nominated ? (
                      <Text variant="footnote" weight="semibold" color="tint">
                        {t('eventFlow.detail.inSquad')}
                      </Text>
                    ) : null}
                  </View>
                  <RsvpControl
                    value={child.rsvp}
                    subjectName={firstName(child.name)}
                    onChange={(status, absence) => void submitRsvp(status, absence, child.userId)}
                    disabled={pendingRsvp != null || availabilityIsClosed}
                    testID={`event-rsvp-child-${child.userId}`}
                  />
                  {child.rsvp === 'NO' && (child.reason || child.note) ? (
                    <Text variant="footnote" color="secondary">
                      {[reasonLabel(child.reason, t), child.note].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              ))}
            </SectionGroup>
          </View>
        ) : null}

        {showCheckIn ? (
          <View
            style={[
              styles.card,
              styles.inline,
              { backgroundColor: c.surface, borderColor: c.borderSubtle },
            ]}
          >
            <Icon
              name={checkedInAt ? 'checkmark.circle.fill' : 'figure.walk'}
              size={20}
              color={checkedInAt ? c.primary : c.textSecondary}
            />
            <Text variant="body" color="primary" style={styles.flex}>
              {checkedInAt
                ? t('eventFlow.checkIn.done', {
                    time: new Intl.DateTimeFormat(locale, {
                      hour: '2-digit', hourCycle: 'h23',
                      minute: '2-digit',
                    }).format(new Date(checkedInAt)),
                  })
                : t('eventFlow.checkIn.prompt')}
            </Text>
            {!checkedInAt ? (
              <Button
                label={t('eventFlow.checkIn.action')}
                variant="filled"
                size="md"
                loading={checkingIn}
                onPress={() => void checkIn()}
                testID="event-check-in"
              />
            ) : null}
          </View>
        ) : null}

        {event.fixtureId && event.team ? (
          <SectionGroup>
            <ListRow
              title={t('eventFlow.detail.liveTitle')}
              subtitle={t('eventFlow.detail.liveSubtitle')}
              left={<Icon name="football" size={20} color="secondary" />}
              showChevron
              onPress={() =>
                router.push({
                  pathname: '/match-detail',
                  params: { fixtureId: event.fixtureId as string, teamId: event.team?.id ?? '' },
                })
              }
              testID="event-open-match"
            />
          </SectionGroup>
        ) : null}

        {segments.length > 1 ? (
          <SegmentedControl<Segment>
            segments={segments}
            value={activeSegment}
            onChange={setSegment}
            testID="event-segments"
          />
        ) : (
          <Text variant="footnote" weight="semibold" color="secondary" style={styles.sectionLabel}>
            {t('eventFlow.detail.tabResponses')}
          </Text>
        )}

        {activeSegment === 'responses' ? (
          <ResponsesPanel
            rsvps={event.rsvps}
            members={event.members}
            canManage={canManage}
            viewerUserId={user?.id}
            reminderEligibleUserIds={event.reminderEligibleUserIds}
            remind={
              canManage && !started && !cancelled && !availabilityIsClosed
                ? {
                    onPress: () => void remind(),
                    pending: reminding,
                    cooldownUntil: remindCooldown,
                    sentCount: remindSent,
                    uncertainCount: remindUncertain,
                  }
                : null
            }
            onOpenAttendance={
              canManage && started && !cancelled ? () => setAttendanceOpen(true) : null
            }
          />
        ) : null}
        {activeSegment === 'squad' && clubId ? (
          <SquadPanel
            clubId={clubId}
            event={event}
            locale={locale}
            onPublished={() => void fetchEvent()}
            onOpenLineup={() =>
              router.push({ pathname: '/lineup-builder', params: { eventId: event.id } })
            }
          />
        ) : null}
        {activeSegment === 'rides' && clubId ? (
          <CarpoolBoard
            clubId={clubId}
            eventId={event.id}
            eventDate={event.date}
            meetingAt={event.meetingAt}
            locale={locale}
            riders={riders}
            cancelled={cancelled}
          />
        ) : null}
      </ScrollView>

      {clubId ? (
        <AttendanceSheet
          visible={attendanceOpen}
          onClose={() => setAttendanceOpen(false)}
          clubId={clubId}
          eventId={event.id}
          eventDate={event.date}
          canManageAttendance={canManage}
          canRecordAttendance={!cancelled && !event.archivedAt}
          actorId={user?.id}
          members={event.members}
          rsvps={event.rsvps.map((entry) => ({
            userId: entry.userId,
            user: entry.user,
            status: entry.status,
            reason: entry.reason,
          }))}
        />
      ) : null}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" color="primary" numberOfLines={2}>
            {title}
          </Text>
          <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
            <ListRow
              title={t('eventFlow.manage.edit')}
              left={<Icon name="pencil" size={18} color="secondary" />}
              onPress={() => {
                setMenuOpen(false)
                router.push({ pathname: '/create-event', params: { eventId: event.id } })
              }}
              testID="event-menu-edit"
            />
            <ListRow
              title={t('eventFlow.manage.duplicate')}
              left={<Icon name="doc.on.doc" size={18} color="secondary" />}
              onPress={() => {
                setMenuOpen(false)
                router.push({ pathname: '/create-event', params: { duplicateFrom: event.id } })
              }}
              style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
            />
            <ListRow
              title={t('eventFlow.manage.share')}
              left={<Icon name="square.and.arrow.up" size={18} color="secondary" />}
              onPress={() => void share()}
              style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
            />
            <ListRow
              title={t('eventFlow.manage.cancel')}
              left={<Icon name="xmark.circle" size={18} color={c.error} />}
              destructive
              onPress={() => {
                setMenuOpen(false)
                setCancelOpen(true)
              }}
              style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
              testID="event-menu-cancel"
            />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={cancelOpen}
        onClose={() => {
          if (!cancelling) setCancelOpen(false)
        }}
        heightPct="auto"
      >
        <View style={styles.sheet}>
          <Text variant="title3" color="primary">
            {t('eventFlow.manage.cancelTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('eventFlow.manage.cancelBody')}
          </Text>
          {event.seriesId ? (
            <SegmentedControl<'this' | 'following'>
              segments={[
                { key: 'this', label: t('eventFlow.scope.this') },
                { key: 'following', label: t('eventFlow.scope.following') },
              ]}
              value={cancelScope}
              onChange={setCancelScope}
            />
          ) : null}
          <FormInput
            label={t('eventFlow.manage.cancelReason')}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder={t('eventFlow.manage.cancelReasonPlaceholder')}
            maxLength={200}
            returnKeyType="done"
          />
          <Button
            label={t('eventFlow.manage.cancelConfirm')}
            variant="destructive"
            size="lg"
            fullWidth
            loading={cancelling}
            onPress={() => void confirmCancel()}
            testID="event-cancel-confirm"
          />
          <Button
            label={t('eventFlow.manage.keep')}
            variant="plain"
            size="md"
            fullWidth
            disabled={cancelling}
            onPress={() => setCancelOpen(false)}
          />
        </View>
      </BottomSheet>
    </View>
  )
}

function reminderCooldownFromError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const body = data as { retryAfter?: unknown; error?: { retryAfter?: unknown } }
  const timestamp = body.error?.retryAfter ?? body.retryAfter
  if (typeof timestamp !== 'string') return null
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) && parsed > Date.now() ? timestamp : null
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'sheet'
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // 16pt gutters, 24pt between sections.
  content: { padding: space.md, paddingBottom: space['2xl'], gap: space.lg },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: {
    padding: space.md,
    gap: space.sm + space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  cardBody: { padding: space.md, gap: space.sm + space.xs },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  inlineTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    borderTopWidth: hairline,
    paddingTop: space.sm + space.xs,
    minHeight: 44,
  },
  childRow: { gap: space.sm },
  childHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionLabel: { paddingHorizontal: space.sm },
  sheet: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.md },
  menu: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
})
