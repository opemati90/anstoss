import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Alert, Platform, Modal } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { createEventSchema } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors, useIsDark } from '../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { ApiError, api } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, BottomSheet, Button, ListRow, SegmentedControl, Text, Icon } from '../src/components/ui'
import { FormInput } from '../src/components/FormInput'
import { elevation, hairline, radius, space } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

const MINUTE_INTERVAL = 5

type TeamGroupResponse = {
  id: string
  displayName: string
  teams: Array<{
    id: string
    displayName: string
    squadLabel: string | null
    leagueName: string | null
  }>
}

type TeamOption = {
  id: string
  displayName: string
  groupName: string
}

function getInitialEventDateTime() {
  const value = new Date()
  value.setMinutes(value.getMinutes() + 60)
  value.setSeconds(0, 0)
  const roundedMinutes = Math.ceil(value.getMinutes() / MINUTE_INTERVAL) * MINUTE_INTERVAL

  if (roundedMinutes >= 60) {
    value.setHours(value.getHours() + 1, 0, 0, 0)
  } else {
    value.setMinutes(roundedMinutes, 0, 0)
  }

  return value
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess, activeTeamId, setActiveTeam } = useAuth()
  const c = useClubColors()
  const isDark = useIsDark()
  const insets = useSafeAreaInsetsSafe()
  const [isLoading, setIsLoading] = useState(false)
  // `eventId` opens the same form in edit mode (PATCH); `duplicateFrom`
  // pre-fills it from another event so a coach can post "same as last week"
  // without retyping the title, place and notes.
  const params = useLocalSearchParams<{ eventId?: string; duplicateFrom?: string }>()
  const editingId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId
  const duplicateFrom = Array.isArray(params.duplicateFrom)
    ? params.duplicateFrom[0]
    : params.duplicateFrom
  const isEdit = Boolean(editingId)
  const [prefillLoading, setPrefillLoading] = useState(Boolean(editingId || duplicateFrom))
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId)

  const [title, setTitle] = useState(() => t('event.type.TRAINING'))
  const [titleTouched, setTitleTouched] = useState(false)
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [teamSheetOpen, setTeamSheetOpen] = useState(false)

  // Single source of truth for the scheduled date+time. The native picker owns
  // its own scroll/animation, so there is no controlled-wheel feedback loop to
  // freeze the JS thread (the failure mode of the old hand-rolled ScrollPicker).
  const [eventDate, setEventDate] = useState<Date>(() => getInitialEventDateTime())

  useEffect(() => {
    const sourceId = editingId || duplicateFrom
    if (!sourceId || !activeClub) return
    let cancelled = false
    ;(async () => {
      try {
        const source = await api<{
          title: string
          type: (typeof EVENT_TYPES)[number]
          date: string
          teamId: string
          location: string | null
          notes: string | null
        }>(`/clubs/${activeClub.club.id}/events/${sourceId}`)
        if (cancelled) return
        setTitle(source.title)
        setTitleTouched(true)
        setType(source.type)
        setLocation(source.location ?? '')
        setNotes(source.notes ?? '')
        setSelectedTeamId(source.teamId)
        // Editing keeps the real date. A duplicate of something in the past
        // rolls forward a week at a time until it lands in the future, which
        // is what "same as last Tuesday" means.
        const next = new Date(source.date)
        if (duplicateFrom) {
          while (next.getTime() < Date.now()) next.setDate(next.getDate() + 7)
        }
        setEventDate(next)
      } catch {
        Alert.alert(t('common.error'), t('event.manage.updateFailed'))
      } finally {
        if (!cancelled) setPrefillLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editingId, duplicateFrom, activeClub?.club.id])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const minimumDate = useMemo(() => startOfToday(), [])

  // Apply only the Y/M/D from a date-mode pick, preserving the chosen time.
  const applyDatePart = useCallback((picked: Date) => {
    setEventDate((prev) => {
      const next = new Date(prev)
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
      return next
    })
  }, [])

  // Apply only the time from a time-mode pick, preserving the chosen day.
  const applyTimePart = useCallback((picked: Date) => {
    setEventDate((prev) => {
      const next = new Date(prev)
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
      return next
    })
  }, [])

  const locale = getAppLocale(getAppLanguage())
  const dateDisplay = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(eventDate),
    [eventDate, locale],
  )
  const timeDisplay = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(eventDate),
    [eventDate, locale],
  )
  const handleTypeChange = useCallback(
    (nextType: (typeof EVENT_TYPES)[number]) => {
      setType(nextType)
      if (!titleTouched) setTitle(t(`event.type.${nextType}`))
    },
    [t, titleTouched],
  )
  const canCreate = useMemo(() => {
    if (activeClub?.permissions?.EVENTS != null) {
      return Boolean(activeClub.permissions.EVENTS)
    }

    return (
      activeClub?.role === 'OWNER' ||
      activeClub?.role === 'ADMIN' ||
      activeClub?.role === 'COACH' ||
      activeTeamAccess?.role === 'HEAD_COACH' ||
      activeTeamAccess?.role === 'ASSISTANT_COACH'
    )
  }, [activeClub, activeTeamAccess])
  const showTeamPicker = teamOptions.length > 1 || !activeTeamId

  useEffect(() => {
    let cancelled = false

    async function loadTeams() {
      if (!activeClub) {
        return
      }

      setTeamsLoading(true)
      try {
        const groups = await api<TeamGroupResponse[]>(`/clubs/${activeClub.club.id}/team-groups`)

        if (cancelled) {
          return
        }

        const nextOptions = (groups || []).flatMap((group) =>
          group.teams.map((team) => ({
            id: team.id,
            displayName: team.displayName || team.squadLabel || group.displayName,
            groupName: group.displayName,
          })),
        )

        setTeamOptions(nextOptions)

        if (activeTeamId && nextOptions.some((team) => team.id === activeTeamId)) {
          setSelectedTeamId(activeTeamId)
          return
        }

        setSelectedTeamId((current) =>
          current && nextOptions.some((team) => team.id === current)
            ? current
            : (nextOptions[0]?.id ?? null),
        )
      } catch {
        if (!cancelled) {
          const fallbackTeam = activeTeamId
            ? [
                {
                  id: activeTeamId,
                  displayName:
                    activeTeamAccess?.team?.displayName ||
                    activeTeamAccess?.team?.name ||
                    t('event.currentTeam'),
                  groupName: t('event.currentTeam'),
                },
              ]
            : []

          setTeamOptions(fallbackTeam)
          setSelectedTeamId(activeTeamId ?? fallbackTeam[0]?.id ?? null)
        }
      } finally {
        if (!cancelled) {
          setTeamsLoading(false)
        }
      }
    }

    void loadTeams()

    return () => {
      cancelled = true
    }
  }, [activeClub, activeTeamAccess?.team?.displayName, activeTeamAccess?.team?.name, activeTeamId, t])

  const handleCreate = async () => {
    if (!activeClub || !selectedTeamId) {
      Alert.alert(t('common.errorTitle'), t('event.noTeamSelected'))
      return
    }

    const parsedDate = new Date(eventDate)

    // Guard against an invalid composed date — parsedDate.toISOString() below
    // throws RangeError on an Invalid Date, which would crash the screen.
    if (Number.isNaN(parsedDate.getTime())) {
      Alert.alert(t('event.dateRequiredTitle'), t('event.datePastError'))
      return
    }

    // Reject past events at wall-clock precision. minimumDate blocks past days
    // in the date wheel, but the time wheel can still land on an earlier hour
    // today, so the final guard compares against now, not just start-of-day.
    if (parsedDate.getTime() < Date.now()) {
      Alert.alert(t('event.dateRequiredTitle'), t('event.datePastError'))
      return
    }

    const isoDate = parsedDate.toISOString()
    const validation = createEventSchema.safeParse({
      title: title.trim(),
      type,
      date: isoDate,
      teamId: selectedTeamId,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    })

    if (!validation.success) {
      const message = validation.error.issues[0]?.message || t('errors.server')
      if (message.toLowerCase().includes('date')) {
        Alert.alert(t('event.dateRequiredTitle'), message)
        return
      }
      Alert.alert(t('event.titleRequiredTitle'), message)
      return
    }

    setIsLoading(true)
    try {
      if (isEdit && editingId) {
        // PATCH takes everything but the team; moving an event between teams
        // is a different operation and is not offered here.
        const { teamId: _ignored, ...changes } = validation.data
        await api(`/clubs/${activeClub.club.id}/events/${editingId}`, {
          method: 'PATCH',
          body: changes,
        })
      } else {
        await api(`/clubs/${activeClub.club.id}/events`, {
          method: 'POST',
          body: validation.data,
        })
      }
      if (selectedTeamId !== activeTeamId) {
        setActiveTeam(selectedTeamId)
      }
      router.back()
    } catch (error) {
      const message =
        error instanceof ApiError && error.message ? error.message : t('event.createErrorBody')

      if (message.includes('manage events')) {
        Alert.alert(t('common.accessDenied'), t('event.permissionDenied'))
        return
      }

      Alert.alert(t('event.createErrorTitle'), message)
    } finally {
      setIsLoading(false)
    }
  }

  const screenTitle = isEdit
    ? t('event.manage.editTitle')
    : duplicateFrom
      ? t('event.manage.duplicateTitle')
      : t('event.newScreenTitle')

  if (!canCreate) {
    return (
      <Screen
        header={<ModalHeader title={screenTitle} onClose={() => router.back()} />}
        padded={false}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('event.permissionDenied')}
        />
      </Screen>
    )
  }

  const selectedTeamLabel =
    teamOptions.find((team) => team.id === selectedTeamId)?.displayName ??
    activeTeamAccess?.team?.displayName ??
    null

  if (!teamsLoading && teamOptions.length === 0) {
    return (
      <Screen
        header={<ModalHeader title={screenTitle} onClose={() => router.back()} />}
        padded={false}
      >
        <EmptyState
          icon="figure.soccer.fill"
          title={t('event.noEligibleTeamTitle')}
          description={t('event.noEligibleTeamBody')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={screenTitle} onClose={() => router.back()} />}
      padded={false}
    >
      {/* No KeyboardAvoidingView: on an iOS form sheet a JS KAV fights the native
          sheet layout and (previously, with fitToContents) froze + crashed the
          screen on text-field focus. We match the working edit-profile sheet —
          a plain ScrollView with native keyboard insets (iOS) that scrolls the
          focused field above the keyboard with zero JS layout feedback. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        {/* One flat form: what, when, where. The type is a segmented control,
            the title is the only free field above the fold, and date, time
            and team are rows with their value on the right. Location and
            notes sit underneath in plain sight; folding them behind a toggle
            saved nothing and hid the two fields most events need. */}
        <SegmentedControl<(typeof EVENT_TYPES)[number]>
          segments={EVENT_TYPES.map((eventType) => ({
            key: eventType,
            label: t(`event.type.${eventType}`),
          }))}
          value={type}
          onChange={handleTypeChange}
        />

        <FormInput
          label={t('event.title')}
          value={title}
          onChangeText={(value) => {
            setTitle(value)
            setTitleTouched(true)
          }}
          placeholder={t(`event.placeholders.${type}`)}
          testID="event-title-input"
          maxLength={100}
        />

        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <ListRow
            title={t('event.date')}
            left={<Icon name="calendar" size={18} color="secondary" />}
            right={
              <Text variant="body" color="primary" weight="semibold" tabular>
                {dateDisplay}
              </Text>
            }
            accessibilityLabel={`${t('event.date')}: ${dateDisplay}`}
            showChevron
            onPress={() => setShowDatePicker(true)}
          />
          <ListRow
            title={t('event.time')}
            left={<Icon name="clock" size={18} color="secondary" />}
            right={
              <Text variant="body" color="primary" weight="semibold" tabular>
                {timeDisplay}
              </Text>
            }
            accessibilityLabel={`${t('event.time')}: ${timeDisplay}`}
            showChevron
            onPress={() => setShowTimePicker(true)}
            style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
          />
          {showTeamPicker ? (
            <ListRow
              title={t('event.teamLabel')}
              left={<Icon name="person.2" size={18} color="secondary" />}
              right={
                <Text variant="body" color="primary" weight="semibold" numberOfLines={1}>
                  {selectedTeamLabel ?? ''}
                </Text>
              }
              accessibilityLabel={`${t('event.teamLabel')}: ${selectedTeamLabel ?? ''}`}
              showChevron
              onPress={() => setTeamSheetOpen(true)}
              style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
            />
          ) : selectedTeamLabel ? (
            <ListRow
              title={t('event.teamLabel')}
              left={<Icon name="person.2" size={18} color="secondary" />}
              right={
                <Text variant="body" color="secondary" numberOfLines={1}>
                  {selectedTeamLabel}
                </Text>
              }
              accessibilityLabel={`${t('event.teamLabel')}: ${selectedTeamLabel}`}
              style={{ borderTopWidth: hairline, borderTopColor: c.borderSubtle }}
            />
          ) : null}
        </View>

        <FormInput
          label={t('event.locationOptional')}
          value={location}
          onChangeText={setLocation}
          placeholder={t('event.placeholders.location')}
          maxLength={200}
        />
        <FormInput
          label={t('event.notesOptional')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('event.placeholders.notes')}
          style={styles.textArea}
          multiline
          numberOfLines={3}
          maxLength={1000}
        />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.borderSubtle }]}>
        {/* No summary line here: the team row and the date/time chips are a
            few points above it in the same sheet. Repeating them cost two
            lines of a scroll area that was already clipping its last field. */}
        <Button
          label={isEdit ? t('event.manage.saveChanges') : t('event.createButton')}
          variant="filled"
          size="lg"
          loading={isLoading}
          disabled={isLoading || prefillLoading || !selectedTeamId || !title.trim()}
          onPress={handleCreate}
          testID="event-create-submit"
        />
      </View>

      <BottomSheet visible={teamSheetOpen} onClose={() => setTeamSheetOpen(false)} heightPct="auto">
        <View style={styles.sheetBody}>
          <Text variant="headline" weight="semibold" color="primary">
            {t('event.teamLabel')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            {teamOptions.map((team, index) => (
              <ListRow
                key={team.id}
                testID={`event-team-${team.id}`}
                title={team.displayName}
                selected={selectedTeamId === team.id}
                right={
                  selectedTeamId === team.id ? (
                    <Icon name="checkmark.circle.fill" size={20} color="tint" />
                  ) : undefined
                }
                onPress={() => {
                  setSelectedTeamId(team.id)
                  setTeamSheetOpen(false)
                }}
                style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

      {/* Date picker — native wheel (iOS in a bottom sheet, Android system dialog) */}
      {Platform.OS === 'ios' ? (
        <PickerSheet
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          title={t('event.date')}
          doneLabel={t('common.done')}
          closeLabel={t('common.close')}
          c={c}
          insets={insets}
        >
          <DateTimePicker
            value={eventDate}
            mode="date"
            display="spinner"
            minimumDate={minimumDate}
            locale={locale}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={c.primary}
            textColor={c.textPrimary}
            onChange={(_event: DateTimePickerEvent, picked?: Date) => {
              if (picked) applyDatePart(picked)
            }}
            style={styles.iosPicker}
          />
        </PickerSheet>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={eventDate}
            mode="date"
            minimumDate={minimumDate}
            onChange={(event: DateTimePickerEvent, picked?: Date) => {
              setShowDatePicker(false)
              if (event.type === 'set' && picked) applyDatePart(picked)
            }}
          />
        )
      )}

      {/* Time picker — native wheel (iOS in a bottom sheet, Android system dialog) */}
      {Platform.OS === 'ios' ? (
        <PickerSheet
          visible={showTimePicker}
          onClose={() => setShowTimePicker(false)}
          title={t('event.time')}
          doneLabel={t('common.done')}
          closeLabel={t('common.close')}
          c={c}
          insets={insets}
        >
          <DateTimePicker
            value={eventDate}
            mode="time"
            display="spinner"
            minuteInterval={MINUTE_INTERVAL}
            locale={locale}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={c.primary}
            textColor={c.textPrimary}
            onChange={(_event: DateTimePickerEvent, picked?: Date) => {
              if (picked) applyTimePart(picked)
            }}
            style={styles.iosPicker}
          />
        </PickerSheet>
      ) : (
        showTimePicker && (
          <DateTimePicker
            value={eventDate}
            mode="time"
            minuteInterval={MINUTE_INTERVAL}
            onChange={(event: DateTimePickerEvent, picked?: Date) => {
              setShowTimePicker(false)
              if (event.type === 'set' && picked) applyTimePart(picked)
            }}
          />
        )
      )}
    </Screen>
  )
}

type PickerSheetProps = {
  visible: boolean
  onClose: () => void
  title: string
  doneLabel: string
  closeLabel: string
  c: ReturnType<typeof useClubColors>
  insets: { bottom: number }
  children: React.ReactNode
}

// iOS-only bottom sheet that hosts a native spinner picker. Reused for both the
// date and time wheels so the chrome (grabber, header, Done) stays consistent.
function PickerSheet({
  visible,
  onClose,
  title,
  doneLabel,
  closeLabel,
  c,
  insets,
  children,
}: PickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.surfaceOverlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: c.background,
              ...elevation.hero,
              paddingBottom: space.xl + insets.bottom,
            },
          ]}
        >
          <View style={styles.sheetGrabberWrap}>
            <View style={[styles.sheetGrabber, { backgroundColor: c.borderDefault }]} />
          </View>
          <View style={[styles.sheetHeader, { borderBottomColor: c.borderDefault }]}>
            <Text variant="headline" color="primary">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              hitSlop={12}
              style={({ pressed }) => [styles.sheetDoneButton, pressed && styles.pressed]}
            >
              <Text variant="headline" weight="semibold" color={c.primary}>
                {doneLabel}
              </Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  sheetBody: { gap: space.md, paddingHorizontal: space.md, paddingBottom: space.lg },
  scroll: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  textArea: {
    minHeight: 72,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  pressed: { transform: [{ scale: 0.985 }] },
  footer: {
    borderTopWidth: hairline,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.md,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  bottomSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingBottom: space.xl,
    paddingHorizontal: space.lg,
  },
  sheetGrabberWrap: {
    alignItems: 'center',
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  sheetGrabber: {
    width: 36,
    height: 5,
    borderRadius: radius.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    marginBottom: space.sm,
  },
  sheetDoneButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  iosPicker: {
    alignSelf: 'stretch',
  },
})
