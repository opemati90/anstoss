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
import { Ionicons } from '@expo/vector-icons'
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, space, fonts, fontSize, radius, fontWeight, lineHeight } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

function parseDate(input: string): Date | null {
  const match = input.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (!match) return null
  const [, dayStr, monthStr, yearStr] = match
  const day = parseInt(dayStr, 10)
  const month = parseInt(monthStr, 10)
  const year = parseInt(yearStr, 10)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2024) return null
  const d = new Date(year, month - 1, day)
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null
  return d
}

function parseTime(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const [isLoading, setIsLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [dateText, setDateText] = useState('')
  const [timeText, setTimeText] = useState('18:00')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const handleCreate = async () => {
    if (!activeClub || !activeTeamId) {
      Alert.alert(t('common.errorTitle'), t('event.noTeamSelected'))
      return
    }

    const parsedDate = parseDate(dateText)
    if (!parsedDate) {
      Alert.alert(t('event.dateRequiredTitle'), t('event.dateRequiredBody'))
      return
    }

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    if (parsedDate < now) {
      Alert.alert(t('event.dateRequiredTitle'), t('event.datePastError'))
      return
    }

    const parsedTime = parseTime(timeText)
    const hours = parsedTime?.hours ?? 18
    const minutes = parsedTime?.minutes ?? 0
    parsedDate.setHours(hours, minutes, 0, 0)

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
              <View style={styles.inputWithIcon}>
                <Ionicons name="calendar-outline" size={18} color={neutralColors.textSecondary} />
                <TextInput
                  style={styles.iconInput}
                  value={dateText}
                  onChangeText={setDateText}
                  placeholder="DD.MM.YYYY"
                  placeholderTextColor={neutralColors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.label}>{t('event.time')}</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="time-outline" size={18} color={neutralColors.textSecondary} />
                <TextInput
                  style={styles.iconInput}
                  value={timeText}
                  onChangeText={setTimeText}
                  placeholder="18:00"
                  placeholderTextColor={neutralColors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
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
  iconInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    fontFamily: fonts.data,
    minHeight: 44,
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
