import { useState } from 'react'
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
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { neutralColors, space, fonts, fontSize, radius, fontWeight, lineHeight } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const [isLoading, setIsLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<Date | null>(null)
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)

  const formatTime = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)

  const handleDateChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false)
    if (date) setSelectedDate(date)
  }

  const handleTimeChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false)
    if (date) setSelectedTime(date)
  }

  const handleCreate = async () => {
    if (!activeClub || !activeTeamId) {
      Alert.alert(t('common.errorTitle'), t('event.noTeamSelected'))
      return
    }

    if (!selectedDate) {
      Alert.alert(t('event.dateRequiredTitle'), t('event.dateRequiredBody'))
      return
    }

    const eventDate = new Date(selectedDate)
    if (selectedTime) {
      eventDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0)
    } else {
      eventDate.setHours(18, 0, 0, 0)
    }

    const isoDate = eventDate.toISOString()
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

  const defaultPickerDate = selectedDate ?? new Date()
  const defaultPickerTime = selectedTime ?? (() => {
    const d = new Date()
    d.setHours(18, 0, 0, 0)
    return d
  })()

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
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('event.date')}
              >
                <Ionicons name="calendar-outline" size={18} color={neutralColors.textSecondary} />
                <Text
                  style={[
                    styles.pickerText,
                    !selectedDate && styles.pickerPlaceholder,
                  ]}
                >
                  {selectedDate
                    ? formatDate(selectedDate)
                    : t('event.datePlaceholder')}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.label}>{t('event.time')}</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('event.time')}
              >
                <Ionicons name="time-outline" size={18} color={neutralColors.textSecondary} />
                <Text
                  style={[
                    styles.pickerText,
                    !selectedTime && styles.pickerPlaceholder,
                  ]}
                >
                  {selectedTime
                    ? formatTime(selectedTime)
                    : '18:00'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {Platform.OS === 'ios' && showDatePicker && (
            <View style={styles.iosPickerContainer}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={[styles.iosPickerDone, { color: theme.clubPrimary }]}>
                    {t('common.done')}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={defaultPickerDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={new Date()}
                locale={locale}
              />
            </View>
          )}

          {Platform.OS === 'ios' && showTimePicker && (
            <View style={styles.iosPickerContainer}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={[styles.iosPickerDone, { color: theme.clubPrimary }]}>
                    {t('common.done')}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={defaultPickerTime}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                is24Hour
                locale={locale}
              />
            </View>
          )}

          {Platform.OS === 'android' && showDatePicker && (
            <DateTimePicker
              value={defaultPickerDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}

          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              value={defaultPickerTime}
              mode="time"
              display="default"
              onChange={handleTimeChange}
              is24Hour
            />
          )}

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
  pickerButton: {
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
  pickerText: {
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    fontFamily: fonts.data,
    flex: 1,
  },
  pickerPlaceholder: {
    color: neutralColors.textTertiary,
  },
  iosPickerContainer: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginTop: space.sm,
    overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  iosPickerDone: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
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
})
