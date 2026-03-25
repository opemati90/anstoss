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
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { createEventSchema } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('event.newScreenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
              <Ionicons
                name={
                  eventType === 'TRAINING'
                    ? 'fitness'
                    : eventType === 'MATCH'
                      ? 'football'
                      : 'ellipse'
                }
                size={16}
                color={type === eventType ? '#FFF' : neutralColors.textSecondary}
              />
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

        <Text style={styles.label}>{t('event.date')}</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder={t('event.datePlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        />

        <Text style={styles.label}>{t('event.time')}</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder={t('event.timePlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        />

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
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  headerSpacer: { width: 28 },
  content: { padding: 20, paddingBottom: 40 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  createButton: {
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  createButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
})
