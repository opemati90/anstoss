import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import {
  createEventSchema,
  createEventSeriesSchema,
  MAX_SERIES_WEEKDAYS,
  updateEventSchema,
  type EventDetail,
  type EventFeedItem,
} from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors, useIsDark } from '../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { ApiError, api } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { EmptyState } from '../src/components/EmptyState'
import {
  BottomSheet,
  Button,
  Icon,
  ListRow,
  SectionGroup,
  SegmentedControl,
  SoftIcon,
  Text,
  type IconName,
} from '../src/components/ui'
import { eventDisplayTitle, formatClock } from '../src/components/events/eventFormat'
import {
  atTime,
  defaultKickoff,
  defaultTrainingDate,
  planDates,
  seasonEnd,
  winterBreak,
} from '../src/components/events/eventPlan'
import {
  fonts,
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_INPUT,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
} from '../src/theme/tokens'

type EventType = 'TRAINING' | 'MATCH' | 'OTHER'
type Repeat = 'none' | 'weekly' | 'biweekly'
type HomeAway = 'HOME' | 'AWAY'
type PickerKind = 'date' | 'time' | 'until'

type TeamGroupResponse = {
  id: string
  displayName: string
  teams: Array<{ id: string; displayName: string; squadLabel: string | null }>
}
type TeamOption = { id: string; displayName: string }

/** Mo–So in German order; values are Date#getDay (0 = Sunday). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const
const DURATIONS = [60, 75, 90, 105, 120] as const
const MINUTE_INTERVAL = 5
/** Design 12's "Treffpunkt vorher" chips. Tap the selected chip again for none. */
const MEETING_LEADS = [15, 30, 45, 60] as const

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { fontScale } = useWindowDimensions()
  const isDark = useIsDark()
  const insets = useSafeAreaInsetsSafe()
  const locale = getAppLocale(getAppLanguage())
  const { activeClub, activeTeamAccess, activeTeamId, setActiveTeam } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const params = useLocalSearchParams<{ eventId?: string; duplicateFrom?: string; type?: string }>()
  const editingId = pickParam(params.eventId)
  const duplicateFrom = pickParam(params.duplicateFrom)
  const isEdit = Boolean(editingId)

  const [type, setType] = useState<EventType>(() =>
    params.type === 'MATCH' ? 'MATCH' : params.type === 'OTHER' ? 'OTHER' : 'TRAINING',
  )
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(activeTeamId)
  const [teamSheet, setTeamSheet] = useState(false)
  const [prefilling, setPrefilling] = useState(Boolean(editingId || duplicateFrom))
  const [saving, setSaving] = useState(false)

  // Shared fields
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState<Date>(() => defaultTrainingDate())

  // Training
  const [repeat, setRepeat] = useState<Repeat>(isEdit ? 'none' : 'weekly')
  const [durationSheet, setDurationSheet] = useState(false)
  const [weekdays, setWeekdays] = useState<number[]>(() => [defaultTrainingDate().getDay()])
  const [until, setUntil] = useState<Date>(() => seasonEnd())
  const [duration, setDuration] = useState<number>(90)

  // Match
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<HomeAway>('HOME')
  const [meetingLead, setMeetingLead] = useState<number>(() => (params.type === 'MATCH' ? 30 : 0))
  const [leadTouched, setLeadTouched] = useState(false)
  const [meetingPoint, setMeetingPoint] = useState('')
  const [carpool, setCarpool] = useState(false)
  const [carpoolTouched, setCarpoolTouched] = useState(false)
  // Team benachrichtigen: remind open replies 24 h before (design 12).
  const [autoReminder, setAutoReminder] = useState(true)
  const [timeSheet, setTimeSheet] = useState(false)
  const [repeatSheet, setRepeatSheet] = useState(false)

  // Edit
  const [seriesId, setSeriesId] = useState<string | null>(null)
  // The start as loaded, so an edit only sends (and checks) a date it changed.
  const [originalDate, setOriginalDate] = useState<Date | null>(null)
  const [daysCapped, setDaysCapped] = useState(false)
  const [scope, setScope] = useState<'this' | 'following'>('this')

  const [picker, setPicker] = useState<PickerKind | null>(null)
  // The team's usual training time, so switching Spiel -> Training restores it.
  const trainingTime = useRef<{ hours: number; minutes: number }>({ hours: 19, minutes: 0 })

  const canCreate = useMemo(() => {
    if (activeClub?.permissions?.EVENTS != null) return Boolean(activeClub.permissions.EVENTS)
    return (
      activeClub?.role === 'OWNER' ||
      activeClub?.role === 'ADMIN' ||
      activeClub?.role === 'COACH' ||
      activeTeamAccess?.role === 'HEAD_COACH' ||
      activeTeamAccess?.role === 'ASSISTANT_COACH'
    )
  }, [activeClub, activeTeamAccess])

  // Teams the coach can plan for.
  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    ;(async () => {
      try {
        const groups = await api<TeamGroupResponse[]>(`/clubs/${clubId}/team-groups`)
        if (cancelled) return
        const options = (groups ?? []).flatMap((group) =>
          group.teams.map((team) => ({
            id: team.id,
            displayName: team.displayName || team.squadLabel || group.displayName,
          })),
        )
        setTeamOptions(options)
        setTeamId((current) =>
          current && options.some((team) => team.id === current) ? current : (options[0]?.id ?? null),
        )
      } catch {
        if (cancelled) return
        const fallback = activeTeamId
          ? [{ id: activeTeamId, displayName: activeTeamAccess?.team?.displayName || activeTeamAccess?.team?.name || t('eventFlow.create.currentTeam') }]
          : []
        setTeamOptions(fallback)
        setTeamId(activeTeamId ?? null)
      } finally {
        if (!cancelled) setTeamsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeTeamAccess?.team?.displayName, activeTeamAccess?.team?.name, activeTeamId, clubId, t])

  // Edit / duplicate: load the source event.
  useEffect(() => {
    const sourceId = editingId || duplicateFrom
    if (!sourceId || !clubId) return
    let cancelled = false
    ;(async () => {
      try {
        const source = await api<EventDetail>(`/clubs/${clubId}/events/${sourceId}`)
        if (cancelled) return
        const start = new Date(source.date)
        if (duplicateFrom) {
          while (start.getTime() < Date.now()) start.setDate(start.getDate() + 7)
        }
        setType(source.type)
        setTeamId(source.teamId)
        setDate(start)
        setLocation(source.location ?? '')
        setNotes(source.notes ?? '')
        setDuration(source.durationMin ?? 90)
        setAutoReminder(source.rsvpAutoReminder ?? true)
        setWeekdays([start.getDay()])
        setRepeat('none')
        setMeetingLead(
          source.meetingAt
            ? Math.max(0, Math.round((new Date(source.date).getTime() - new Date(source.meetingAt).getTime()) / 60000))
            : 0,
        )
        setLeadTouched(true)
        if (source.type === 'MATCH') {
          setOpponent(source.opponent ?? '')
          setHomeAway(source.homeAway === 'AWAY' ? 'AWAY' : 'HOME')
          setMeetingPoint(source.meetingPoint ?? '')
          setCarpool(Boolean(source.carpoolEnabled))
          setCarpoolTouched(true)
          if (!source.opponent) setTitle(source.title)
        } else if (
          source.type === 'OTHER' ||
          eventDisplayTitle(source, t) !== t('eventFlow.type.TRAINING')
        ) {
          // A derived "Training" title stays derived; a typed one is kept.
          setTitle(source.title)
        }
        if (editingId) {
          setSeriesId(source.seriesId ?? null)
          setOriginalDate(new Date(source.date))
        }
      } catch {
        Alert.alert(t('eventFlow.create.loadFailedTitle'), t('eventFlow.create.loadFailedBody'))
      } finally {
        if (!cancelled) setPrefilling(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, duplicateFrom, editingId, t])

  // New training: prefill from the team's latest training (time, length,
  // place, training days) so a coach confirms rather than types.
  useEffect(() => {
    if (isEdit || duplicateFrom || !clubId || !teamId) return
    let cancelled = false
    ;(async () => {
      try {
        const query = (scope: 'upcoming' | 'past') =>
          api<EventFeedItem[]>(
            `/clubs/${clubId}/events?teamId=${teamId}&type=TRAINING&scope=${scope}&limit=1`,
          ).catch(() => [] as EventFeedItem[])
        const latest = (await query('upcoming'))[0] ?? (await query('past'))[0]
        if (!latest || cancelled) return
        const last = new Date(latest.date)
        let days = [last.getDay()]
        if (latest.seriesId) {
          const detail = await api<EventDetail>(`/clubs/${clubId}/events/${latest.id}`).catch(() => null)
          if (detail?.series?.weekdays?.length) days = detail.series.weekdays
        }
        if (cancelled) return
        setWeekdays(days)
        trainingTime.current = { hours: last.getHours(), minutes: last.getMinutes() }
        setDate((current) => atTime(current, last.getHours(), last.getMinutes()))
        if (latest.durationMin) setDuration(latest.durationMin)
        if (latest.location) setLocation((current) => current || (latest.location ?? ''))
      } catch {
        // Defaults stay in place.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, duplicateFrom, isEdit, teamId])

  const switchType = (next: EventType) => {
    setType(next)
    if (isEdit || duplicateFrom) return
    if (!leadTouched) setMeetingLead(next === 'MATCH' ? (homeAway === 'AWAY' ? 60 : 30) : 0)
    if (next === 'MATCH') {
      setDate(defaultKickoff())
      setRepeat('none')
    } else if (next === 'TRAINING') {
      const base = defaultTrainingDate()
      setDate(atTime(base, trainingTime.current.hours, trainingTime.current.minutes))
      setRepeat('weekly')
    } else {
      setRepeat('none')
    }
  }

  const switchHomeAway = (next: HomeAway) => {
    setHomeAway(next)
    if (!leadTouched) setMeetingLead(next === 'AWAY' ? 60 : 30)
    if (!carpoolTouched) setCarpool(next === 'AWAY')
  }

  const repeating = type === 'TRAINING' && repeat !== 'none' && !isEdit
  const plan = useMemo(
    () =>
      repeating
        ? planDates(date, until, weekdays, repeat === 'biweekly' ? 2 : 1, date.getHours(), date.getMinutes())
        : [],
    [date, repeat, repeating, until, weekdays],
  )

  // Only a typed title is sent. A Training without one and a match with an
  // opponent get a derived title that every reader sees in their language
  // ("Training", "Heimspiel gegen SV Babelsberg 03").
  const typedTitle = type === 'MATCH' && opponent.trim() ? '' : title.trim()
  const hasTitle =
    typedTitle.length >= 2 || type === 'TRAINING' || (type === 'MATCH' && Boolean(opponent.trim()))

  const canSubmit =
    !saving && !prefilling && Boolean(teamId) && hasTitle && (!repeating || plan.length > 0)

  const toggleWeekday = (day: number) => {
    if (weekdays.includes(day)) {
      setDaysCapped(false)
      setWeekdays(weekdays.filter((value) => value !== day))
    } else if (weekdays.length >= MAX_SERIES_WEEKDAYS) {
      setDaysCapped(true)
    } else {
      setWeekdays([...weekdays, day])
    }
  }

  const save = async () => {
    if (!clubId || !teamId || !canSubmit) return
    const first = repeating ? plan[0] : date
    const dateChanged = !isEdit || !originalDate || originalDate.getTime() !== first?.getTime()
    // A past event can still be corrected (notes, place); only a new date
    // has to lie ahead.
    if (!first || (dateChanged && first.getTime() <= Date.now())) {
      Alert.alert(t('eventFlow.create.pastTitle'), t('eventFlow.create.pastBody'))
      return
    }
    // The Treffpunkt is a lead before the start, for every type (the API keeps
    // the offset across a series and when the start moves).
    const firstMeeting = meetingLead > 0 ? new Date(first.getTime() - meetingLead * 60000) : null
    const payload = {
      ...(typedTitle ? { title: typedTitle } : {}),
      type,
      date: first.toISOString(),
      teamId,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(type === 'MATCH'
        ? {
            opponent: opponent.trim() || null,
            homeAway,
            meetingPoint: meetingPoint.trim() || null,
            carpoolEnabled: carpool,
          }
        : {}),
      ...(type === 'TRAINING' ? { durationMin: duration } : {}),
      rsvpAutoReminder: autoReminder,
      ...(firstMeeting ? { meetingAt: firstMeeting.toISOString() } : isEdit ? { meetingAt: null } : {}),
    }
    // Edits send every field (null clears it, L6) and the date only when it
    // moved; a new event is checked against the create rule.
    const { teamId: _team, date: _date, ...changes } = payload
    const editBody = {
      ...changes,
      title: typedTitle || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      ...(dateChanged ? { date: first.toISOString() } : {}),
      ...(seriesId ? { scope } : {}),
    }
    const check = isEdit ? updateEventSchema.safeParse(editBody) : createEventSchema.safeParse(payload)
    if (!check.success) {
      Alert.alert(t('eventFlow.create.invalidTitle'), t('eventFlow.create.failedBody'))
      return
    }

    setSaving(true)
    try {
      if (isEdit && editingId) {
        await api(`/clubs/${clubId}/events/${editingId}`, { method: 'PATCH', body: editBody })
      } else if (repeating) {
        const body = {
          ...payload,
          repeat: {
            intervalWeeks: repeat === 'biweekly' ? 2 : 1,
            until: until.toISOString(),
            weekdays,
          },
        }
        const series = createEventSeriesSchema.safeParse(body)
        if (!series.success) {
          Alert.alert(t('eventFlow.create.untilTitle'), t('eventFlow.create.untilBody'))
          setSaving(false)
          return
        }
        await api(`/clubs/${clubId}/events/series`, { method: 'POST', body })
      } else {
        await api(`/clubs/${clubId}/events`, { method: 'POST', body: payload })
      }
      if (teamId !== activeTeamId) setActiveTeam(teamId)
      router.back()
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403
      Alert.alert(
        denied ? t('eventFlow.create.deniedTitle') : t('eventFlow.create.failedTitle'),
        denied ? t('eventFlow.create.deniedBody') : t('eventFlow.create.failedBody'),
      )
    } finally {
      setSaving(false)
    }
  }

  const screenTitle = isEdit
    ? t('eventFlow.create.editTitle')
    : duplicateFrom
      ? t('eventFlow.create.duplicateTitle')
      : t('eventFlow.create.newTitle')

  const header = (
    <View
      style={[
        styles.header,
        {
          paddingTop: Platform.OS === 'ios' ? SPACING_MD : insets.top + SPACING_MD,
          backgroundColor: c.background,
        },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('eventFlow.cancelAction')}
        style={styles.headerSide}
        testID="event-create-cancel"
      >
        <Text variant="callout" weight="semibold" color="tint">
          {t('eventFlow.cancelAction')}
        </Text>
      </Pressable>
      <Text
        variant="headline"
        weight="bold"
        color="primary"
        numberOfLines={1}
        style={styles.headerTitle}
        accessibilityRole="header"
      >
        {screenTitle}
      </Text>
      <View style={styles.headerSide} />
    </View>
  )

  if (!canCreate) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        {header}
        <EmptyState icon="lock.shield.fill" title={t('eventFlow.create.deniedTitle')} description={t('eventFlow.create.deniedBody')} />
      </View>
    )
  }

  if (teamsLoaded && teamOptions.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        {header}
        <EmptyState
          icon="figure.soccer"
          title={t('eventFlow.create.noTeamTitle')}
          description={t('eventFlow.create.noTeamBody')}
        />
      </View>
    )
  }

  const teamLabel = teamOptions.find((team) => team.id === teamId)?.displayName ?? ''
  const untilLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(until)
  const durationLabel = t('eventFlow.create.durationUntil', {
    minutes: t('eventFlow.create.minutes', { count: duration }),
    time: formatClock(new Date(date.getTime() + duration * 60000), locale),
  })
  const season = seasonEnd()
  const winter = winterBreak()
  const sep = { borderTopWidth: hairline, borderTopColor: c.borderSubtle }
  const leads: number[] =
    meetingLead === 0 || MEETING_LEADS.includes(meetingLead as (typeof MEETING_LEADS)[number])
      ? [...MEETING_LEADS]
      : [...MEETING_LEADS, meetingLead].sort((x, y) => x - y)

  const ctaLabel = isEdit ? t('eventFlow.create.save') : t('eventFlow.create.saveEvent')
  const timeTitle = type === 'MATCH' ? t('eventFlow.detail.kickoff') : t('eventFlow.detail.start')
  // Design 12: "Di, 17. Nov." and "18:30 – 20:00".
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(repeating && plan[0] ? plan[0] : date)
    .replace(/^(\p{L}+)\.,/u, '$1,')
  const timeLabel =
    type === 'TRAINING'
      ? `${formatClock(date, locale)} – ${formatClock(new Date(date.getTime() + duration * 60000), locale)}`
      : formatClock(date, locale)
  const repeatLabel = [
    repeat === 'biweekly' ? t('eventFlow.create.repeatBiweekly') : t('eventFlow.create.repeatWeekly'),
    WEEKDAYS.filter((day) => weekdays.includes(day))
      .map((day) => t(`eventFlow.weekday.${day}`))
      .join(', '),
    untilLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {header}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {!isEdit ? (
          <SegmentedControl<EventType>
            segments={[
              { key: 'TRAINING', label: t('eventFlow.type.TRAINING'), testID: 'event-type-TRAINING' },
              { key: 'MATCH', label: t('eventFlow.type.MATCH'), testID: 'event-type-MATCH' },
              { key: 'OTHER', label: t('eventFlow.type.OTHER'), testID: 'event-type-OTHER' },
            ]}
            value={type}
            onChange={switchType}
          />
        ) : null}

        {/* Spiel: who we play, first. Otherwise the title. */}
        {type === 'MATCH' ? (
          <View style={styles.block}>
            <Field
              label={t('eventFlow.create.opponent')}
              value={opponent}
              onChangeText={setOpponent}
              placeholder={t('eventFlow.create.opponentPlaceholder')}
              maxLength={100}
              autoCapitalize="words"
              testID="event-opponent-input"
            />
            <SegmentedControl<HomeAway>
              segments={[
                { key: 'HOME', label: t('eventFlow.home'), testID: 'event-home' },
                { key: 'AWAY', label: t('eventFlow.away'), testID: 'event-away' },
              ]}
              value={homeAway}
              onChange={switchHomeAway}
            />
          </View>
        ) : (
          <Field
            label={t('eventFlow.create.title')}
            value={title}
            onChangeText={setTitle}
            placeholder={type === 'TRAINING' ? t('eventFlow.type.TRAINING') : t('eventFlow.create.titlePlaceholder')}
            maxLength={100}
            testID="event-title-input"
          />
        )}

        {/* Design 12's one group: Datum · Zeit · Ort · Jede Woche. */}
        <SectionGroup>
          {teamOptions.length > 1 ? (
            <ListRow
              title={t('eventFlow.create.team')}
              left={<SoftIcon name="person.2" />}
              right={<ValueText>{teamLabel}</ValueText>}
              onPress={isEdit ? undefined : () => setTeamSheet(true)}
              accessibilityLabel={`${t('eventFlow.create.team')}: ${teamLabel}`}
              testID="event-team-row"
            />
          ) : null}
          <ListRow
            title={t('eventFlow.create.date')}
            left={<SoftIcon name="calendar" />}
            right={<ValueText>{dateLabel}</ValueText>}
            onPress={() => setPicker('date')}
            accessibilityLabel={`${t('eventFlow.create.date')}: ${dateLabel}`}
            testID="event-date-row"
          />
          <ListRow
            title={t('eventFlow.create.time')}
            left={<SoftIcon name="clock" />}
            right={<ValueText data>{timeLabel}</ValueText>}
            onPress={() => (type === 'TRAINING' ? setTimeSheet(true) : setPicker('time'))}
            accessibilityLabel={`${t('eventFlow.create.time')}: ${timeLabel}`}
            testID="event-time-row"
          />
          {type === 'MATCH' ? (
            <InputRow
              icon="mappin.and.ellipse"
              label={t('eventFlow.detail.meetingPoint')}
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder={t('eventFlow.create.meetingPointPlaceholder')}
              maxLength={200}
              testID="event-meeting-point-input"
            />
          ) : null}
          <InputRow
            icon="mappin"
            label={t('eventFlow.detail.place')}
            value={location}
            onChangeText={setLocation}
            placeholder={
              type === 'MATCH'
                ? homeAway === 'HOME'
                  ? t('eventFlow.create.venueHomePlaceholder')
                  : t('eventFlow.create.venueAwayPlaceholder')
                : t('eventFlow.create.placePlaceholder')
            }
            maxLength={200}
            testID="event-location-input"
          />
          {type === 'TRAINING' && !isEdit ? (
            <View style={styles.switchRow}>
              <SoftIcon name="arrow.clockwise" />
              <Text variant="callout" weight="semibold" color="primary" style={styles.flex}>
                {t('eventFlow.create.everyWeek')}
              </Text>
              <Toggle
                value={repeat !== 'none'}
                onChange={(on) => setRepeat(on ? 'weekly' : 'none')}
                accessibilityLabel={t('eventFlow.create.everyWeekA11y')}
                testID="event-repeat-switch"
              />
            </View>
          ) : null}
          {repeating ? (
            <ListRow
              title={t('eventFlow.create.repeat')}
              subtitle={repeatLabel}
              onPress={() => setRepeatSheet(true)}
              accessibilityLabel={`${t('eventFlow.create.repeat')}: ${repeatLabel}`}
              testID="event-repeat-row"
            />
          ) : null}
        </SectionGroup>

        {/* Treffpunkt vorher: a lead before the start, as chips. */}
        <View style={styles.block}>
          <Text variant="footnote" weight="semibold" color="primary">
            {t('eventFlow.create.meetingBefore', { defaultValue: 'Meet before' })}
          </Text>
          <View
            style={styles.chipRow}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('eventFlow.create.meetingBefore', { defaultValue: 'Meet before' })}
            testID="event-meeting-leads"
          >
            {leads.map((lead) => (
              <Chip
                key={lead}
                label={t('eventFlow.create.leadMinutes', { count: lead })}
                selected={meetingLead === lead}
                onPress={() => {
                  setMeetingLead(meetingLead === lead ? 0 : lead)
                  setLeadTouched(true)
                }}
                testID={`event-meeting-${lead}`}
              />
            ))}
          </View>
        </View>

        {/* Team benachrichtigen: reminder 24 h before to open replies. */}
        <SectionGroup>
          <View style={styles.switchRow}>
            <SoftIcon name="bell" />
            <View style={[styles.flex, styles.switchText]}>
              <Text variant="callout" weight="semibold" color="primary">
                {t('eventFlow.create.notifyTeam')}
              </Text>
              <Text variant="caption1" weight="regular" color="secondary">
                {t('eventFlow.create.notifyTeamHint')}
              </Text>
            </View>
            <Toggle
              value={autoReminder}
              onChange={setAutoReminder}
              accessibilityLabel={t('eventFlow.create.notifyTeam')}
              testID="event-notify-switch"
            />
          </View>
        </SectionGroup>

        {/* Beyond the design's form: Fahrgemeinschaft (Spiel) and notes. */}
        <SectionGroup>
          {type === 'MATCH' ? (
            <View style={styles.switchRow}>
              <SoftIcon name="car" />
              <View style={[styles.flex, styles.switchText]}>
                <Text variant="callout" weight="semibold" color="primary">
                  {t('eventFlow.create.carpool')}
                </Text>
                <Text variant="caption1" weight="regular" color="secondary">
                  {t('eventFlow.create.carpoolHint')}
                </Text>
              </View>
              <Toggle
                value={carpool}
                onChange={(value) => {
                  setCarpool(value)
                  setCarpoolTouched(true)
                }}
                accessibilityLabel={t('eventFlow.create.carpool')}
                testID="event-carpool-switch"
              />
            </View>
          ) : null}
          <InputRow
            icon="doc.text"
            label={t('eventFlow.create.notes')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('eventFlow.create.notesPlaceholder')}
            multiline
            maxLength={1000}
            testID="event-notes-input"
          />
        </SectionGroup>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.borderSubtle,
            paddingBottom: Math.max(insets.bottom, SPACING_LG),
          },
        ]}
      >
        {isEdit && seriesId ? (
          <SegmentedControl<'this' | 'following'>
            segments={[
              { key: 'this', label: t('eventFlow.scope.this'), testID: 'event-scope-this' },
              { key: 'following', label: t('eventFlow.scope.following'), testID: 'event-scope-following' },
            ]}
            value={scope}
            onChange={setScope}
          />
        ) : null}
        <Button
          label={ctaLabel}
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSubmit}
          onPress={() => void save()}
          testID="event-create-submit"
        />
      </View>

      <BottomSheet visible={timeSheet} onClose={() => setTimeSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('eventFlow.create.time')}
          </Text>
          <SectionGroup>
            <ListRow
              title={timeTitle}
              right={<ValueText data>{formatClock(date, locale)}</ValueText>}
              onPress={() => {
                setTimeSheet(false)
                setPicker('time')
              }}
              testID="event-start-row"
            />
            <ListRow
              title={t('eventFlow.create.duration')}
              right={<ValueText>{durationLabel}</ValueText>}
              onPress={() => {
                setTimeSheet(false)
                setDurationSheet(true)
              }}
              testID="event-duration-row"
            />
          </SectionGroup>
        </View>
      </BottomSheet>

      <BottomSheet visible={repeatSheet} onClose={() => setRepeatSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('eventFlow.create.repeat')}
          </Text>
          <SectionGroup>
            <View style={styles.rowGroup}>
              <View
                style={styles.chipRow}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('eventFlow.create.repeat')}
              >
                {(['weekly', 'biweekly'] as const).map((option) => (
                  <Chip
                    key={option}
                    label={
                      option === 'weekly'
                        ? t('eventFlow.create.repeatWeekly')
                        : t('eventFlow.create.repeatBiweekly')
                    }
                    selected={repeat === option}
                    onPress={() => setRepeat(option)}
                    testID={`event-repeat-${option}`}
                  />
                ))}
              </View>
            </View>
            <View style={styles.rowGroup} testID="event-weekdays">
              <Text variant="footnote" weight="semibold" color="primary">
                {t('eventFlow.create.days')}
              </Text>
              <View style={styles.dayChips}>
                {WEEKDAYS.map((day) => {
                  const selected = weekdays.includes(day)
                  return (
                    <Pressable
                      key={day}
                      testID={`event-weekday-${day}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={t(`eventFlow.weekdayLong.${day}`)}
                      android_ripple={{ color: c.borderSubtle }}
                      onPress={() => toggleWeekday(day)}
                      style={[
                        styles.dayChip,
                        { flexBasis: fontScale > 1.3 ? 40 * Math.min(fontScale, 2) : 36 },
                        selected
                          ? { backgroundColor: c.ink, borderColor: c.ink }
                          : { backgroundColor: 'transparent', borderColor: c.borderStrong },
                      ]}
                    >
                      <Text
                        variant="subheadline"
                        weight="semibold"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        color={selected ? c.onInk : c.textPrimary}
                      >
                        {t(`eventFlow.weekday.${day}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
            <View style={styles.rowGroup}>
              <View style={styles.untilHead}>
                <Text variant="footnote" weight="semibold" color="primary" style={styles.flex}>
                  {t('eventFlow.create.until')}
                </Text>
                <Text variant="callout" weight="semibold" color="primary" tabular>
                  {untilLabel}
                </Text>
              </View>
              <View style={styles.chipRow}>
                <Chip
                  label={t('eventFlow.create.seasonEnd')}
                  selected={sameDay(until, season)}
                  onPress={() => setUntil(season)}
                  testID="event-until-season"
                />
                {winter ? (
                  <Chip
                    label={t('eventFlow.create.winterBreak')}
                    selected={sameDay(until, winter)}
                    onPress={() => setUntil(winter)}
                    testID="event-until-winter"
                  />
                ) : null}
                <Chip
                  label={t('eventFlow.create.pickDate')}
                  selected={!sameDay(until, season) && !(winter && sameDay(until, winter))}
                  onPress={() => {
                    setRepeatSheet(false)
                    setPicker('until')
                  }}
                  testID="event-until-pick"
                />
              </View>
            </View>
          </SectionGroup>
          {daysCapped ? (
            <Text variant="footnote" color="secondary" style={styles.hint} testID="event-days-capped">
              {t('eventFlow.create.maxDays')}
            </Text>
          ) : null}
          {plan.length > 0 ? (
            <Text variant="footnote" color="secondary" style={styles.hint}>
              {t('eventFlow.create.seriesHint', {
                count: plan.length,
                first: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(plan[0]),
              })}
            </Text>
          ) : (
            <Text variant="footnote" color="error" style={styles.hint}>
              {t('eventFlow.create.seriesEmpty')}
            </Text>
          )}
        </View>
      </BottomSheet>

      <BottomSheet visible={durationSheet} onClose={() => setDurationSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('eventFlow.create.duration')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {DURATIONS.map((value, index) => (
              <ListRow
                key={value}
                testID={`event-duration-${value}`}
                title={t('eventFlow.create.minutes', { count: value })}
                selected={duration === value}
                right={duration === value ? <Icon name="checkmark" size={18} color={c.primary} /> : undefined}
                onPress={() => {
                  setDuration(value)
                  setDurationSheet(false)
                }}
                style={index > 0 ? sep : undefined}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

      <BottomSheet visible={teamSheet} onClose={() => setTeamSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('eventFlow.create.team')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {teamOptions.map((team, index) => (
              <ListRow
                key={team.id}
                testID={`event-team-${team.id}`}
                title={team.displayName}
                selected={teamId === team.id}
                right={teamId === team.id ? <Icon name="checkmark" size={18} color={c.primary} /> : undefined}
                onPress={() => {
                  setTeamId(team.id)
                  setTeamSheet(false)
                }}
                style={index > 0 ? sep : undefined}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

      <DateTimeSheet
        kind={picker}
        onClose={() => setPicker(null)}
        value={picker === 'until' ? until : date}
        minimumDate={picker === 'until' ? date : picker === 'date' ? startOfToday() : undefined}
        locale={locale}
        isDark={isDark}
        title={
          picker === 'until'
            ? t('eventFlow.create.until')
            : picker === 'time'
              ? timeTitle
              : t('eventFlow.create.date')
        }
        doneLabel={t('eventFlow.done')}
        onChange={(picked) => {
          if (picker === 'until') {
            setUntil(new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 23, 59))
          } else if (picker === 'date') {
            setDate((current) => {
              const next = new Date(current)
              next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
              return next
            })
          } else if (picker === 'time') {
            setDate((current) => atTime(current, picked.getHours(), picked.getMinutes()))
          }
        }}
      />
    </View>
  )
}

function ValueText({ children, data }: { children: string; data?: boolean }) {
  // Values wrap rather than truncate: "Fr, 12. Sep. 2026" at font scale 2
  // must stay readable on a 320pt phone. Times are Barlow (design 11).
  return data ? (
    <Text variant="data" color="primary" numberOfLines={1} style={styles.valueData}>
      {children}
    </Text>
  ) : (
    <Text variant="callout" color="secondary" tabular numberOfLines={2} style={styles.value}>
      {children}
    </Text>
  )
}

/** Design 11's standalone field: semibold label above a 52pt white input. */
function Field({ label, testID, ...rest }: TextInputProps & { label: string }) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.field}>
      <Text variant="footnote" weight="semibold" color="primary">
        {label}
      </Text>
      <TextInput
        {...rest}
        style={[
          styles.fieldInput,
          { color: c.textPrimary, backgroundColor: c.surface, borderColor: focused ? c.ink : c.borderDefault },
        ]}
        placeholderTextColor={c.textTertiary}
        accessibilityLabel={label}
        testID={testID}
        onFocus={(e) => {
          setFocused(true)
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          rest.onBlur?.(e)
        }}
      />
    </View>
  )
}

/**
 * A text field as a group row: icon well, small label above a borderless
 * input, so it sits in the white group next to picker rows.
 */
function InputRow({
  label,
  icon,
  style,
  multiline,
  testID,
  ...rest
}: TextInputProps & { label: string; icon: IconName }) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)
  if (!multiline) {
    // Design 12's Ort row: label left, the value right in muted text.
    return (
      <View style={styles.inputRow}>
        <SoftIcon name={icon} />
        <Text variant="callout" weight="semibold" color={focused ? 'tint' : 'primary'}>
          {label}
        </Text>
        <TextInput
          style={[styles.input, styles.inputInline, { color: c.textSecondary }, style]}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={label}
          testID={testID}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          {...rest}
        />
      </View>
    )
  }
  return (
    <View style={styles.inputRow}>
      <SoftIcon name={icon} />
      <View style={styles.flex}>
        <Text variant="caption1" weight="semibold" color={focused ? 'tint' : 'secondary'}>
          {label}
        </Text>
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline, { color: c.textPrimary }, style]}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={label}
          multiline={multiline}
          testID={testID}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          {...rest}
        />
      </View>
    </View>
  )
}

/** Design 12's switch: 52x32 ink track (off: #D9D7CE-ish), 26pt white knob. */
function Toggle({
  value,
  onChange,
  accessibilityLabel,
  testID,
}: {
  value: boolean
  onChange: (next: boolean) => void
  accessibilityLabel: string
  testID?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      testID={testID}
      style={[
        styles.toggle,
        { backgroundColor: value ? c.ink : c.borderStrong, alignItems: value ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: c.surface }]} />
    </Pressable>
  )
}

/** Design `.chip`: 36pt outlined pill, ink when selected; 44pt touch target. */
function Chip({
  label,
  selected,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string
  selected: boolean
  onPress: () => void
  testID?: string
  accessibilityLabel?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: c.borderSubtle }}
      hitSlop={4}
      testID={testID}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: c.ink, borderColor: c.ink }
          : { backgroundColor: 'transparent', borderColor: c.borderStrong },
      ]}
    >
      <Text variant="footnote" weight="semibold" tabular color={selected ? c.onInk : c.textPrimary}>
        {label}
      </Text>
    </Pressable>
  )
}


function DateTimeSheet({
  kind,
  onClose,
  value,
  minimumDate,
  maximumDate,
  locale,
  isDark,
  title,
  doneLabel,
  onChange,
}: {
  kind: PickerKind | null
  onClose: () => void
  value: Date
  minimumDate?: Date
  maximumDate?: Date
  locale: string
  isDark: boolean
  title: string
  doneLabel: string
  onChange: (picked: Date) => void
}) {
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const mode = kind === 'time' ? 'time' : 'date'

  if (Platform.OS !== 'ios') {
    if (!kind) return null
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        minuteInterval={MINUTE_INTERVAL}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event: DateTimePickerEvent, picked?: Date) => {
          onClose()
          if (event.type === 'set' && picked) onChange(picked)
        }}
      />
    )
  }

  return (
    <Modal visible={Boolean(kind)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.surfaceOverlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={doneLabel}
        />
        <View style={[styles.pickerSheet, { backgroundColor: c.background, paddingBottom: SPACING_XL + insets.bottom }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: c.borderSubtle }]}>
            <Text variant="headline" weight="semibold" color="primary">
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={doneLabel} style={styles.doneButton}>
              <Text variant="headline" weight="semibold" color="tint">
                {doneLabel}
              </Text>
            </Pressable>
          </View>
          {kind ? (
            <DateTimePicker
              value={value}
              mode={mode}
              display="spinner"
              minuteInterval={MINUTE_INTERVAL}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              locale={locale}
              themeVariant={isDark ? 'dark' : 'light'}
              textColor={c.textPrimary}
              onChange={(_event: DateTimePickerEvent, picked?: Date) => {
                if (picked) onChange(picked)
              }}
              style={styles.iosPicker}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

function pickParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function startOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Design .fld: 52pt, 16pt text.
const FIELD_HEIGHT = 52
const FONT_SIZE_FIELD = FONT_SIZE_BODY + 1
const TOGGLE_WIDTH = 52
const TOGGLE_HEIGHT = 32
const TOGGLE_PAD = 3

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_SM,
  },
  // Equal sides keep "Neuer Termin" centred (design 12).
  headerSide: { flex: 1, minWidth: 72, minHeight: 44, justifyContent: 'center' },
  headerTitle: { flexShrink: 1, textAlign: 'center', paddingHorizontal: SPACING_XS },
  // Design 11: 20pt gutters, 20pt between blocks.
  content: { padding: SCREEN_PADDING, paddingBottom: SPACING_XL * 2, gap: SPACING_XL },
  block: { gap: SPACING_MD - 2 },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // A labelled block inside a group (rhythm, training days, end date) shares
  // the row insets of ListRow so labels line up down the whole group.
  rowGroup: { paddingHorizontal: SPACING_LG, paddingVertical: SPACING_MD, gap: SPACING_SM },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_XS },
  dayChip: {
    flexGrow: 1,
    flexBasis: 40,
    minHeight: 44,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  untilHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING_MD, minHeight: 28 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  chip: {
    minHeight: 36,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { textAlign: 'right' },
  valueData: { fontFamily: fonts.data, fontSize: 18, lineHeight: 22 },
  hint: { paddingHorizontal: SPACING_XS },
  field: { gap: SPACING_XS + 2 },
  fieldInput: {
    minHeight: FIELD_HEIGHT,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: SPACING_LG,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_FIELD,
    includeFontPadding: false,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
  },
  input: {
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginTop: SPACING_XXS,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  inputInline: { flex: 1, minWidth: 0, marginTop: 0, textAlign: 'right' },
  switchText: { gap: SPACING_XXS },
  toggle: {
    width: TOGGLE_WIDTH,
    height: TOGGLE_HEIGHT,
    borderRadius: TOGGLE_HEIGHT / 2,
    padding: TOGGLE_PAD,
    justifyContent: 'center',
  },
  knob: {
    width: TOGGLE_HEIGHT - 2 * TOGGLE_PAD,
    height: TOGGLE_HEIGHT - 2 * TOGGLE_PAD,
    borderRadius: RADIUS_FULL,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
    minHeight: 60,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    gap: SPACING_MD,
  },
  sheet: { paddingBottom: SPACING_XL, gap: SPACING_LG },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1 },
  pickerSheet: {
    borderTopLeftRadius: RADIUS_CARD,
    borderTopRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING_XL,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING_LG,
    borderBottomWidth: hairline,
  },
  doneButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING_XS },
  iosPicker: { alignSelf: 'stretch' },
})
