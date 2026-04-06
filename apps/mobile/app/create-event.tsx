import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ScrollPicker } from '../src/components/ScrollPicker'
import { neutralColors, space, fonts, fontSize, radius, fontWeight, lineHeight } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
const YEARS = Array.from({ length: 7 }, (_, i) => String(2024 + i))
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateDisplay(day: number, month: number, year: number): string {
  const d = new Date(year, month, day)
  const dayName = DAY_NAMES[d.getDay()]
  return `${dayName}, ${day} ${MONTHS[month]} ${year}`
}

function formatTimeDisplay(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const [isLoading, setIsLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  // Date picker state
  const now = new Date()
  const [selectedDay, setSelectedDay] = useState(now.getDate() - 1) // index into DAYS
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()) // index into MONTHS
  const [selectedYear, setSelectedYear] = useState(0) // index into YEARS
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Time picker state
  const [selectedHour, setSelectedHour] = useState(18) // index into HOURS
  const [selectedMinute, setSelectedMinute] = useState(0) // index into MINUTES (0 = "00")
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

  const handleCreate = async () => {
    if (!activeClub || !activeTeamId) {
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
      teamId: activeTeamId,
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
      router.back()
    } catch {
      Alert.alert(t('event.createErrorTitle'), t('event.createErrorBody'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('event.newScreenTitle')} onClose={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.helper}>
            {t('event.createScreenHint')}
          </Text>

          <Text style={styles.label}>{t('event.typeLabel')}</Text>
          <View style={styles.typeRow}>
            {EVENT_TYPES.map((eventType) => (
              <TouchableOpacity
                key={eventType}
                style={[
                  styles.typeChip,
                  type === eventType && { backgroundColor: theme.clubPrimary },
                ]}
                onPress={() => setType(eventType)}
                accessibilityRole="button"
                accessibilityLabel={t(`event.type.${eventType}`)}
                accessibilityState={{ selected: type === eventType }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === eventType && { color: neutralColors.textInverse },
                  ]}
                >
                  {t(`event.type.${eventType}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('event.title')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t(`event.placeholders.${type}`)}
            placeholderTextColor={neutralColors.textTertiary}
            maxLength={100}
          />

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={styles.label}>{t('event.date')}</Text>
              <TouchableOpacity
                style={styles.inputWithIcon}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('event.date')}
              >
                <Ionicons name="calendar-outline" size={18} color={neutralColors.textSecondary} />
                <Text style={styles.pickerDisplayText}>{dateDisplay}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inlineFieldSmall}>
              <Text style={styles.label}>{t('event.time')}</Text>
              <TouchableOpacity
                style={styles.inputWithIcon}
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('event.time')}
              >
                <Ionicons name="time-outline" size={18} color={neutralColors.textSecondary} />
                <Text style={styles.pickerDisplayText}>{timeDisplay}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.label}>{t('event.locationOptional')}</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder={t('event.placeholders.location')}
            placeholderTextColor={neutralColors.textTertiary}
            maxLength={200}
          />

          <Text style={styles.label}>{t('event.notesOptional')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('event.placeholders.notes')}
            placeholderTextColor={neutralColors.textTertiary}
            multiline
            numberOfLines={3}
            maxLength={1000}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.createButton,
              { backgroundColor: theme.clubPrimary },
              isLoading && { opacity: 0.6 },
            ]}
            onPress={handleCreate}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={t('event.createButton')}
          >
            {isLoading ? (
              <ActivityIndicator color={neutralColors.textInverse} />
            ) : (
              <Text style={styles.createButtonText}>{t('event.createButton')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Date Picker Bottom Sheet */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('event.date')}</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={[styles.sheetDone, { color: theme.clubPrimary }]}>
                  {t('common.done')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollPicker
              primaryColor={theme.clubPrimary}
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
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowTimePicker(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('event.time')}</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={[styles.sheetDone, { color: theme.clubPrimary }]}>
                  {t('common.done')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollPicker
              primaryColor={theme.clubPrimary}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  flex: {
    flex: 1,
  },
  content: { padding: space.lg, paddingBottom: space.lg },
  helper: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    marginBottom: space.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  typeRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  typeChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  typeChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
    textAlign: 'center',
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
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  inputWithIcon: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    backgroundColor: neutralColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pickerDisplayText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
  },
  textArea: {
    minHeight: 88,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: neutralColors.background,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  createButton: {
    minHeight: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textInverse },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomSheet: {
    backgroundColor: neutralColors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xl,
    paddingHorizontal: space.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    marginBottom: space.sm,
  },
  sheetTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  sheetDone: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
})
