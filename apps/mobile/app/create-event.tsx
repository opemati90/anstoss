import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors, useIsDark } from '../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { ApiError, api } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { elevation, fonts, fontSize, hairline, radius, space } from '../src/theme/tokens'

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
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  // Single source of truth for the scheduled date+time. The native picker owns
  // its own scroll/animation, so there is no controlled-wheel feedback loop to
  // freeze the JS thread (the failure mode of the old hand-rolled ScrollPicker).
  const [eventDate, setEventDate] = useState<Date>(() => getInitialEventDateTime())
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
                    activeTeamAccess?.team.displayName ||
                    activeTeamAccess?.team.name ||
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
  }, [activeClub, activeTeamAccess?.team.displayName, activeTeamAccess?.team.name, activeTeamId, t])

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
      await api(`/clubs/${activeClub.club.id}/events`, {
        method: 'POST',
        body: validation.data,
      })
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

  if (!canCreate) {
    return (
      <Screen
        header={<ModalHeader title={t('event.newScreenTitle')} onClose={() => router.back()} />}
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
    activeTeamAccess?.team.displayName ??
    null

  if (!teamsLoading && teamOptions.length === 0) {
    return (
      <Screen
        header={<ModalHeader title={t('event.newScreenTitle')} onClose={() => router.back()} />}
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
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader title={t('event.newScreenTitle')} onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type */}
          <View style={styles.typeRow}>
            {EVENT_TYPES.map((eventType) => {
              const active = type === eventType
              return (
                <Pressable
                  key={eventType}
                  onPress={() => setType(eventType)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`event.type.${eventType}`)}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.typeChip,
                    {
                      borderColor: active ? c.primary : c.borderDefault,
                      backgroundColor: active ? c.primary : c.surface,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text
                    variant="subheadline"
                    weight="semibold"
                    color={active ? 'inverse' : 'primary'}
                  >
                    {t(`event.type.${eventType}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Title */}
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.borderDefault,
                backgroundColor: c.surface,
                color: c.textPrimary,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder={t(`event.placeholders.${type}`)}
            placeholderTextColor={c.textTertiary}
            maxLength={100}
          />

          {/* Date & Time */}
          <View style={styles.inlineRow}>
            <Pressable
              style={[
                styles.inputWithIcon,
                styles.inlineField,
                { borderColor: c.borderDefault, backgroundColor: c.surface },
              ]}
              onPress={() => setShowDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={t('event.date')}
            >
              <Icon name="calendar.fill" size="sm" color="tint" />
              <Text variant="body" color="primary" tabular style={styles.pickerText}>
                {dateDisplay}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.inputWithIcon,
                styles.inlineFieldSmall,
                { borderColor: c.borderDefault, backgroundColor: c.surface },
              ]}
              onPress={() => setShowTimePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={t('event.time')}
            >
              <Icon name="clock.fill" size="sm" color="tint" />
              <Text variant="body" color="primary" tabular style={styles.pickerText}>
                {timeDisplay}
              </Text>
            </Pressable>
          </View>

          {/* Location */}
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.borderDefault,
                backgroundColor: c.surface,
                color: c.textPrimary,
              },
            ]}
            value={location}
            onChangeText={setLocation}
            placeholder={t('event.placeholders.location')}
            placeholderTextColor={c.textTertiary}
            maxLength={200}
          />

          {/* Notes */}
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                borderColor: c.borderDefault,
                backgroundColor: c.surface,
                color: c.textPrimary,
              },
            ]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('event.placeholders.notes')}
            placeholderTextColor={c.textTertiary}
            multiline
            numberOfLines={2}
            maxLength={1000}
          />

          {/* Team (compact) */}
          {showTeamPicker ? (
            <>
              <FieldLabel>{t('event.teamLabel')}</FieldLabel>
              <View style={styles.teamGrid}>
                {teamOptions.map((team) => {
                  const active = selectedTeamId === team.id
                  return (
                    <Pressable
                      key={team.id}
                      testID={`event-team-${team.id}`}
                      onPress={() => setSelectedTeamId(team.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.teamChip,
                        {
                          borderColor: active ? c.primary : c.borderDefault,
                          backgroundColor: active ? c.primary50 : c.surface,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text
                        variant="subheadline"
                        weight="semibold"
                        color={active ? c.primary : 'primary'}
                        numberOfLines={1}
                        style={styles.teamChipLabel}
                      >
                        {team.displayName}
                      </Text>
                      {active ? <Icon name="checkmark.circle.fill" size="sm" color="tint" /> : null}
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : selectedTeamLabel ? (
            <View
              style={[styles.teamBanner, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <Icon name="person.2.fill" size="sm" color="tint" />
              <Text variant="subheadline" color="secondary" numberOfLines={1}>
                {selectedTeamLabel}
              </Text>
            </View>
          ) : null}

          {/* Submit */}
          <View style={styles.submitBlock}>
            <Button
              label={t('event.createButton')}
              variant="filled"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={isLoading || !selectedTeamId}
              onPress={handleCreate}
              testID="event-create-submit"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </View>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption2" color="tertiary" tracking="wide">
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
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
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
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
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: { padding: space.lg, gap: space.md },
  teamGrid: {
    gap: space.sm,
  },
  teamChip: {
    height: 44,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  teamChipLabel: {
    flex: 1,
  },
  teamBanner: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  typeRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  typeChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  inlineField: {
    flex: 2,
  },
  inlineFieldSmall: {
    flex: 1,
  },
  input: {
    minHeight: 48,
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  inputWithIcon: {
    minHeight: 48,
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pickerText: {
    flex: 1,
  },
  textArea: {
    minHeight: 72,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  submitBlock: {
    marginTop: space.md,
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
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    marginBottom: space.sm,
  },
  iosPicker: {
    alignSelf: 'stretch',
  },
})
