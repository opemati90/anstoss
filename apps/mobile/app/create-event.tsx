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
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, space } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

export default function CreateEventScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const [isLoading, setIsLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>('TRAINING')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const handleCreate = async () => {
    if (!activeClub || !activeTeamId) return

    const timeString = time.trim() || '18:00'
    const isoDate = new Date(`${date.trim()}T${timeString}:00`).toISOString()
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
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === eventType && { color: '#FFF' },
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
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder={t('event.datePlaceholder')}
                placeholderTextColor={neutralColors.textTertiary}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.label}>{t('event.time')}</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder={t('event.timePlaceholder')}
                placeholderTextColor={neutralColors.textTertiary}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
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
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
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
  content: { padding: 20, paddingBottom: 24 },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    marginBottom: space.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: neutralColors.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  textArea: {
    height: 88,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: neutralColors.background,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  createButton: {
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
})
