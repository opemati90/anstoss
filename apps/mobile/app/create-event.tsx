import { useEffect, useMemo, useState } from 'react'
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
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ApiError, api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { ScrollPicker } from '../src/components/ScrollPicker'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import {
  card,
  elevation,
  fonts,
  fontSize,
  hairline,
  radius,
  space,
} from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
const START_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 7 }, (_, i) => String(START_YEAR + i))
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function formatDateDisplay(day: number, month: number, year: number): string {
  const d = new Date(year, month, day)
  const dayName = DAY_NAMES[d.getDay()]
  return `${dayName}, ${day} ${MONTHS[month]} ${year}`
}

function formatTimeDisplay(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getInitialEventDateTime() {
  const value = new Date()
  value.setMinutes(value.getMinutes() + 60)
  value.setSeconds(0, 0)
  const roundedMinutes = Math.ceil(value.getMinutes() / 5) * 5

  if (roundedMinutes >= 60) {
    value.setHours(value.getHours() + 1, 0, 0, 0)
  } else {
    value.setMinutes(roundedMinutes, 0, 0)
  }

  return value
}

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess, activeTeamId, setActiveTeam } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [isLoading, setIsLoading] = useState(false)
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  // Date picker state
  const initialDateTime = useMemo(() => getInitialEventDateTime(), [])
  const [selectedDay, setSelectedDay] = useState(() => initialDateTime.getDate() - 1)
  const [selectedMonth, setSelectedMonth] = useState(() => initialDateTime.getMonth())
  const [selectedYear, setSelectedYear] = useState(() =>
    Math.max(YEARS.indexOf(String(initialDateTime.getFullYear())), 0),
  )
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Time picker state
  const [selectedHour, setSelectedHour] = useState(() => initialDateTime.getHours())
  const [selectedMinute, setSelectedMinute] = useState(() => initialDateTime.getMinutes() / 5)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const dayValue = parseInt(DAYS[selectedDay], 10)
  const monthValue = selectedMonth
  const yearValue = parseInt(YEARS[selectedYear], 10)
  const hourValue = parseInt(HOURS[selectedHour], 10)
  const minuteValue = parseInt(MINUTES[selectedMinute], 10)

  const dateDisplay = useMemo(
    () => formatDateDisplay(dayValue, monthValue, yearValue),
    [dayValue, monthValue, yearValue],
  )
  const timeDisplay = useMemo(
    () => formatTimeDisplay(hourValue, minuteValue),
    [hourValue, minuteValue],
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
        const groups = await api<TeamGroupResponse[]>(
          `/clubs/${activeClub.club.id}/team-groups`,
        )

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
            : nextOptions[0]?.id ?? null,
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

    const parsedDate = new Date(yearValue, monthValue, dayValue, hourValue, minuteValue, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (parsedDate < today) {
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
        error instanceof ApiError && error.message
          ? error.message
          : t('event.createErrorBody')

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
          contentContainerStyle={[
            styles.content,
            { paddingBottom: space.md },
          ]}
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
                      borderColor: active ? c.clubPrimary : c.border,
                      backgroundColor: active ? c.clubPrimary : c.surface,
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
                borderColor: c.border,
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
                { borderColor: c.border, backgroundColor: c.surface },
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
                { borderColor: c.border, backgroundColor: c.surface },
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
                borderColor: c.border,
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
                borderColor: c.border,
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
                          borderColor: active ? c.clubPrimary : c.border,
                          backgroundColor: active ? c.clubPrimaryLight : c.surface,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text
                        variant="subheadline"
                        weight="semibold"
                        color={active ? c.clubPrimary : 'primary'}
                        numberOfLines={1}
                        style={styles.teamChipLabel}
                      >
                        {team.displayName}
                      </Text>
                      {active ? (
                        <Icon name="checkmark.circle.fill" size="sm" color="tint" />
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : selectedTeamLabel ? (
            <View
              style={[
                styles.teamBanner,
                { backgroundColor: c.surface, borderColor: c.border },
              ]}
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

      {/* Date Picker Bottom Sheet */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowDatePicker(false)}
          />
          <View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: c.background,
                ...elevation.hero,
              },
            ]}
          >
            <View style={styles.sheetGrabberWrap}>
              <View style={[styles.sheetGrabber, { backgroundColor: c.border }]} />
            </View>
            <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
              <Text variant="headline" color="primary">
                {t('event.date')}
              </Text>
              <Pressable
                onPress={() => setShowDatePicker(false)}
                accessibilityRole="button"
                hitSlop={12}
              >
                <Text variant="headline" weight="semibold" color={c.clubPrimary}>
                  {t('common.done')}
                </Text>
              </Pressable>
            </View>
            <ScrollPicker
              primaryColor={c.clubPrimary}
              columns={[
                { items: DAYS, selectedIndex: selectedDay, onSelect: setSelectedDay },
                { items: MONTHS, selectedIndex: selectedMonth, onSelect: setSelectedMonth },
                { items: YEARS, selectedIndex: selectedYear, onSelect: setSelectedYear },
              ]}
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Bottom Sheet */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowTimePicker(false)}
          />
          <View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: c.background,
                ...elevation.hero,
              },
            ]}
          >
            <View style={styles.sheetGrabberWrap}>
              <View style={[styles.sheetGrabber, { backgroundColor: c.border }]} />
            </View>
            <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
              <Text variant="headline" color="primary">
                {t('event.time')}
              </Text>
              <Pressable
                onPress={() => setShowTimePicker(false)}
                accessibilityRole="button"
                hitSlop={12}
              >
                <Text variant="headline" weight="semibold" color={c.clubPrimary}>
                  {t('common.done')}
                </Text>
              </Pressable>
            </View>
            <ScrollPicker
              primaryColor={c.clubPrimary}
              columns={[
                { items: HOURS, selectedIndex: selectedHour, onSelect: setSelectedHour },
                { items: MINUTES, selectedIndex: selectedMinute, onSelect: setSelectedMinute },
              ]}
            />
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
})
