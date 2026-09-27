import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { BottomSheet, Button, Icon, ListRow, SectionGroup, SegmentedControl, Text } from '../src/components/ui'
import { eventDisplayTitle, formatClock } from '../src/components/events/eventFormat'
import {
  atTime,
  defaultKickoff,
  defaultTrainingDate,
  planDates,
  seasonEnd,
  winterBreak,
} from '../src/components/events/eventPlan'
import { FONT_FAMILY_REGULAR, FONT_SIZE_BODY, hairline, radius, space, RADIUS_INPUT } from '../src/theme/tokens'

type EventType = 'TRAINING' | 'MATCH' | 'OTHER'
type Repeat = 'none' | 'weekly' | 'biweekly'
type HomeAway = 'HOME' | 'AWAY'
type PickerKind = 'date' | 'time' | 'meeting' | 'until'

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
  const [repeatSheet, setRepeatSheet] = useState(false)
  const [durationSheet, setDurationSheet] = useState(false)
  const [weekdays, setWeekdays] = useState<number[]>(() => [defaultTrainingDate().getDay()])
  const [until, setUntil] = useState<Date>(() => seasonEnd())
  const [duration, setDuration] = useState<number>(90)

  // Match
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<HomeAway>('HOME')
  const [meetingLead, setMeetingLead] = useState<number>(30)
  const [leadTouched, setLeadTouched] = useState(false)
  const [meetingPoint, setMeetingPoint] = useState('')
  const [carpool, setCarpool] = useState(false)
  const [carpoolTouched, setCarpoolTouched] = useState(false)

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
        setWeekdays([start.getDay()])
        setRepeat('none')
        if (source.type === 'MATCH') {
          setOpponent(source.opponent ?? '')
          setHomeAway(source.homeAway === 'AWAY' ? 'AWAY' : 'HOME')
          setMeetingPoint(source.meetingPoint ?? '')
          setCarpool(Boolean(source.carpoolEnabled))
          setCarpoolTouched(true)
          if (source.meetingAt) {
            setMeetingLead(Math.max(0, Math.round((new Date(source.date).getTime() - new Date(source.meetingAt).getTime()) / 60000)))
          } else {
            setMeetingLead(0)
          }
          setLeadTouched(true)
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

  const meetingAt = type === 'MATCH' && meetingLead > 0 ? new Date(date.getTime() - meetingLead * 60000) : null
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
    const firstMeeting =
      type === 'MATCH' && meetingLead > 0 ? new Date(first.getTime() - meetingLead * 60000) : null
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
            meetingAt: firstMeeting ? firstMeeting.toISOString() : null,
            meetingPoint: meetingPoint.trim() || null,
            carpoolEnabled: carpool,
          }
        : {}),
      ...(type === 'TRAINING' ? { durationMin: duration } : {}),
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
          paddingTop: Platform.OS === 'ios' ? space.sm : insets.top + space.sm,
          backgroundColor: c.background,
          borderBottomColor: c.borderSubtle,
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
        <Text variant="body" color="tint">
          {t('eventFlow.cancelAction')}
        </Text>
      </Pressable>
      <Text variant="headline" weight="semibold" color="primary" numberOfLines={1} style={styles.headerTitle}>
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
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const untilLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(until)
  const repeatLabel =
    repeat === 'weekly'
      ? t('eventFlow.create.repeatWeekly')
      : repeat === 'biweekly'
        ? t('eventFlow.create.repeatBiweekly')
        : t('eventFlow.create.repeatOnce')
  const durationLabel = t('eventFlow.create.durationUntil', {
    minutes: t('eventFlow.create.minutes', { count: duration }),
    time: formatClock(new Date(date.getTime() + duration * 60000), locale),
  })
  const meetingValue = meetingAt ? formatClock(meetingAt, locale) : t('eventFlow.create.noMeeting')
  const season = seasonEnd()
  const winter = winterBreak()
  const sep = { borderTopWidth: hairline, borderTopColor: c.borderSubtle }

  const ctaLabel = isEdit
    ? t('eventFlow.create.save')
    : repeating
      ? t('eventFlow.create.createSeries', { count: plan.length })
      : t('eventFlow.create.create')

  // Rows shared by more than one section.
  const dateRow = (
    <ListRow
      key="date"
      title={t('eventFlow.create.date')}
      left={<Icon name="calendar" size={18} color="secondary" />}
      right={<ValueText>{dateLabel}</ValueText>}
      showChevron
      onPress={() => setPicker('date')}
      accessibilityLabel={`${t('eventFlow.create.date')}: ${dateLabel}`}
      testID="event-date-row"
    />
  )
  const timeRow = (
    <ListRow
      key="time"
      title={type === 'MATCH' ? t('eventFlow.detail.kickoff') : t('eventFlow.detail.start')}
      left={<Icon name="clock" size={18} color="secondary" />}
      right={<ValueText>{formatClock(date, locale)}</ValueText>}
      showChevron
      onPress={() => setPicker('time')}
      accessibilityLabel={`${type === 'MATCH' ? t('eventFlow.detail.kickoff') : t('eventFlow.detail.start')}: ${formatClock(date, locale)}`}
      testID="event-time-row"
    />
  )
  const notesRow = (
    <InputRow
      key="notes"
      label={t('eventFlow.create.notes')}
      value={notes}
      onChangeText={setNotes}
      placeholder={t('eventFlow.create.notesPlaceholder')}
      multiline
      maxLength={1000}
      testID="event-notes-input"
    />
  )
  const titleRow = (
    <InputRow
      key="title"
      label={type === 'TRAINING' ? t('eventFlow.create.titleOptional') : t('eventFlow.create.title')}
      value={title}
      onChangeText={setTitle}
      placeholder={type === 'TRAINING' ? t('eventFlow.type.TRAINING') : t('eventFlow.create.titlePlaceholder')}
      maxLength={100}
      testID="event-title-input"
    />
  )

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

        {teamOptions.length > 1 ? (
          <SectionGroup header={t('eventFlow.create.team')}>
            <ListRow
              title={t('eventFlow.create.team')}
              left={<Icon name="person.2" size={18} color="secondary" />}
              right={<ValueText>{teamLabel}</ValueText>}
              showChevron={!isEdit}
              onPress={isEdit ? undefined : () => setTeamSheet(true)}
              accessibilityLabel={`${t('eventFlow.create.team')}: ${teamLabel}`}
              testID="event-team-row"
            />
          </SectionGroup>
        ) : null}

        {/* Spiel: who we play, first. */}
        {type === 'MATCH' ? (
          <SectionGroup header={t('eventFlow.create.opponent')}>
            <InputRow
              label={t('eventFlow.create.opponent')}
              value={opponent}
              onChangeText={setOpponent}
              placeholder={t('eventFlow.create.opponentPlaceholder')}
              maxLength={100}
              autoCapitalize="words"
              testID="event-opponent-input"
            />
            <View style={styles.controlRow}>
              <SegmentedControl<HomeAway>
                segments={[
                  { key: 'HOME', label: t('eventFlow.home'), testID: 'event-home' },
                  { key: 'AWAY', label: t('eventFlow.away'), testID: 'event-away' },
                ]}
                value={homeAway}
                onChange={switchHomeAway}
              />
            </View>
          </SectionGroup>
        ) : null}

        {/* Wann: date (unless the series picks the days), start, length / kickoff, meeting. */}
        <SectionGroup header={t('eventFlow.create.sectionWhen')}>
          {repeating ? null : dateRow}
          {timeRow}
          {type === 'TRAINING' ? (
            <ListRow
              title={t('eventFlow.create.duration')}
              left={<Icon name="clock.fill" size={18} color="secondary" />}
              right={<ValueText>{durationLabel}</ValueText>}
              showChevron
              onPress={() => setDurationSheet(true)}
              accessibilityLabel={`${t('eventFlow.create.duration')}: ${durationLabel}`}
              testID="event-duration-row"
            />
          ) : null}
          {type === 'MATCH' ? (
            <ListRow
              title={t('eventFlow.detail.meeting')}
              left={<Icon name="person.3" size={18} color="secondary" />}
              right={
                <View style={styles.valueStack}>
                  <ValueText>{meetingValue}</ValueText>
                  {meetingAt ? (
                    <Text variant="footnote" color="secondary" tabular numberOfLines={2} style={styles.valueHelper}>
                      {t('eventFlow.detail.minutesBefore', { count: meetingLead })}
                    </Text>
                  ) : null}
                </View>
              }
              showChevron
              onPress={() => setPicker('meeting')}
              accessibilityLabel={`${t('eventFlow.detail.meeting')}: ${
                meetingAt
                  ? t('eventFlow.create.meetingValue', { time: formatClock(meetingAt, locale), count: meetingLead })
                  : t('eventFlow.create.noMeeting')
              }`}
              testID="event-meeting-row"
            />
          ) : null}
        </SectionGroup>

        {/* Wiederholung (new training only): rule, days, end. */}
        {type === 'TRAINING' && !isEdit ? (
          <View style={styles.section}>
            <SectionGroup header={t('eventFlow.create.sectionRepeat')}>
              <ListRow
                title={t('eventFlow.create.repeat')}
                left={<Icon name="arrow.clockwise" size={18} color="secondary" />}
                right={<ValueText>{repeatLabel}</ValueText>}
                showChevron
                onPress={() => setRepeatSheet(true)}
                accessibilityLabel={`${t('eventFlow.create.repeat')}: ${repeatLabel}`}
                testID="event-repeat-row"
              />
              {repeating ? (
                <View style={styles.rowGroup} testID="event-weekdays">
                  <Text variant="subheadline" color="secondary">
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
                            // Seven chips share one line; at large text sizes they
                            // widen and wrap to two even rows instead of squeezing.
                            { flexBasis: fontScale > 1.3 ? 40 * Math.min(fontScale, 2) : 36 },
                            selected
                              ? { backgroundColor: c.primary, borderColor: c.primary }
                              : { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle },
                          ]}
                        >
                          <Text
                            variant="subheadline"
                            weight="semibold"
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                            color={selected ? c.onPrimary : c.textPrimary}
                          >
                            {t(`eventFlow.weekday.${day}`)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ) : null}
              {repeating ? (
                <View style={styles.rowGroup}>
                  <View style={styles.untilHead}>
                    <Icon name="flag" size={18} color="secondary" />
                    <Text variant="body" color="primary" style={styles.flex}>
                      {t('eventFlow.create.until')}
                    </Text>
                    <Text variant="body" weight="semibold" color="primary" tabular>
                      {untilLabel}
                    </Text>
                  </View>
                  <View style={styles.presetChips}>
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
                      onPress={() => setPicker('until')}
                      testID="event-until-pick"
                    />
                  </View>
                </View>
              ) : null}
            </SectionGroup>
            {repeating && daysCapped ? (
              <Text variant="footnote" color="secondary" style={styles.hint} testID="event-days-capped">
                {t('eventFlow.create.maxDays')}
              </Text>
            ) : null}
            {repeating && plan.length > 0 ? (
              <Text variant="footnote" color="secondary" style={styles.hint}>
                {t('eventFlow.create.seriesHint', {
                  count: plan.length,
                  first: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(plan[0]),
                })}
              </Text>
            ) : repeating ? (
              <Text variant="footnote" color="error" style={styles.hint}>
                {t('eventFlow.create.seriesEmpty')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Wo */}
        <SectionGroup header={t('eventFlow.create.sectionWhere')}>
          {type === 'MATCH' ? (
            <InputRow
              label={t('eventFlow.detail.meetingPoint')}
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder={t('eventFlow.create.meetingPointPlaceholder')}
              maxLength={200}
              testID="event-meeting-point-input"
            />
          ) : null}
          <InputRow
            label={type === 'MATCH' ? t('eventFlow.detail.venue') : t('eventFlow.detail.place')}
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
        </SectionGroup>

        {/* Details */}
        <SectionGroup header={t('eventFlow.create.sectionDetails')}>
          {type !== 'MATCH' ? titleRow : null}
          {type === 'MATCH' ? (
            <View style={styles.switchRow}>
              <Icon name="car" size={18} color="secondary" />
              <View style={styles.flex}>
                <Text variant="body" color="primary">
                  {t('eventFlow.create.carpool')}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t('eventFlow.create.carpoolHint')}
                </Text>
              </View>
              <Switch
                value={carpool}
                onValueChange={(value) => {
                  setCarpool(value)
                  setCarpoolTouched(true)
                }}
                trackColor={{ true: c.primary, false: c.borderStrong }}
                accessibilityLabel={t('eventFlow.create.carpool')}
                testID="event-carpool-switch"
              />
            </View>
          ) : null}
          {notesRow}
        </SectionGroup>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.borderSubtle,
            paddingBottom: Math.max(insets.bottom, space.md),
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

      <BottomSheet visible={repeatSheet} onClose={() => setRepeatSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" color="primary">
            {t('eventFlow.create.repeat')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
            {(['none', 'weekly', 'biweekly'] as const).map((option, index) => (
              <ListRow
                key={option}
                testID={`event-repeat-${option}`}
                title={
                  option === 'weekly'
                    ? t('eventFlow.create.repeatWeekly')
                    : option === 'biweekly'
                      ? t('eventFlow.create.repeatBiweekly')
                      : t('eventFlow.create.repeatOnce')
                }
                selected={repeat === option}
                right={repeat === option ? <Icon name="checkmark" size={18} color={c.primary} /> : undefined}
                onPress={() => {
                  setRepeat(option)
                  setRepeatSheet(false)
                }}
                style={index > 0 ? sep : undefined}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

      <BottomSheet visible={durationSheet} onClose={() => setDurationSheet(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" color="primary">
            {t('eventFlow.create.duration')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
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
          <Text variant="title3" color="primary">
            {t('eventFlow.create.team')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
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
        value={
          picker === 'until'
            ? until
            : picker === 'meeting'
              ? (meetingAt ?? new Date(date.getTime() - 60 * 60000))
              : date
        }
        minimumDate={picker === 'until' ? date : picker === 'date' ? startOfToday() : undefined}
        maximumDate={picker === 'meeting' ? date : undefined}
        locale={locale}
        isDark={isDark}
        title={
          picker === 'until'
            ? t('eventFlow.create.until')
            : picker === 'meeting'
              ? t('eventFlow.detail.meeting')
              : picker === 'time'
                ? type === 'MATCH'
                  ? t('eventFlow.detail.kickoff')
                  : t('eventFlow.detail.start')
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
          } else if (picker === 'meeting') {
            const wall = atTime(date, picked.getHours(), picked.getMinutes())
            setMeetingLead(Math.max(0, Math.round((date.getTime() - wall.getTime()) / 60000)))
            setLeadTouched(true)
          }
        }}
      />
    </View>
  )
}

function ValueText({ children }: { children: string }) {
  // Values wrap rather than truncate: "Fr, 12. Sep. 2026" at font scale 2
  // must stay readable on a 320pt phone.
  return (
    <Text variant="body" weight="semibold" color="primary" tabular numberOfLines={2} style={styles.value}>
      {children}
    </Text>
  )
}

/**
 * A text field as a settings row: label above a borderless input, so it
 * sits inside a card next to picker rows without a second frame.
 */
function InputRow({ label, style, multiline, testID, ...rest }: TextInputProps & { label: string }) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.inputRow}>
      <Text variant="footnote" color={focused ? 'tint' : 'secondary'}>
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
  )
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string
  selected: boolean
  onPress: () => void
  testID?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      android_ripple={{ color: c.borderSubtle }}
      testID={testID}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: c.primary, borderColor: c.primary }
          : { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle },
      ]}
    >
      <Text variant="subheadline" weight="medium" tabular color={selected ? c.textInverse : c.textPrimary}>
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
  const mode = kind === 'time' || kind === 'meeting' ? 'time' : 'date'

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
        <View style={[styles.pickerSheet, { backgroundColor: c.background, paddingBottom: space.lg + insets.bottom }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
  },
  headerSide: { flexShrink: 0, maxWidth: '30%', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', paddingHorizontal: space.xs },
  // 16pt gutters, 24pt between sections.
  content: { padding: space.md, paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  group: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  // A labelled block inside a card (training days, end date) shares the row
  // insets of ListRow so labels line up down the whole card.
  rowGroup: { paddingHorizontal: space.md, paddingVertical: space.sm + space.xs, gap: space.sm },
  controlRow: { paddingHorizontal: space.md, paddingVertical: space.sm + space.xs },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  dayChip: {
    flexGrow: 1,
    flexBasis: 40,
    minHeight: 44,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  untilHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm + space.xs, minHeight: 28 },
  presetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { textAlign: 'right' },
  valueStack: { alignItems: 'flex-end', gap: space['2xs'] },
  valueHelper: { textAlign: 'right' },
  hint: { paddingHorizontal: space.sm },
  inputRow: { paddingHorizontal: space.md, paddingVertical: space.sm + space.xs, gap: space['2xs'] },
  input: {
    minHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    minHeight: 60,
  },
  footer: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingTop: space.sm + space.xs,
    gap: space.sm + space.xs,
  },
  sheet: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1 },
  pickerSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: space.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    borderBottomWidth: hairline,
  },
  doneButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  iosPicker: { alignSelf: 'stretch' },
})
