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
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

const EVENT_TYPES = ['TRAINING', 'MATCH', 'OTHER'] as const

export default function CreateEventScreen() {
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
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter an event title.')
      return
    }
    if (!date.trim()) {
      Alert.alert('Date required', 'Please enter a date (YYYY-MM-DD).')
      return
    }

    // Build ISO date from date + time inputs
    const timeStr = time.trim() || '18:00'
    const isoDate = new Date(`${date.trim()}T${timeStr}:00`).toISOString()

    setIsLoading(true)
    try {
      await api(`/clubs/${activeClub.club.id}/events`, {
        method: 'POST',
        body: {
          title: title.trim(),
          type,
          date: isoDate,
          teamId: activeTeamId,
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      })
      router.back()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create event')
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
        <Text style={styles.headerTitle}>New Event</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Event type */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          {EVENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.typeChip,
                type === t && { backgroundColor: theme.clubPrimary },
              ]}
              onPress={() => setType(t)}
            >
              <Ionicons
                name={
                  t === 'TRAINING'
                    ? 'fitness'
                    : t === 'MATCH'
                      ? 'football'
                      : 'ellipse'
                }
                size={16}
                color={type === t ? '#FFF' : neutralColors.textSecondary}
              />
              <Text
                style={[
                  styles.typeChipText,
                  type === t && { color: '#FFF' },
                ]}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={
            type === 'TRAINING'
              ? 'Training Session'
              : type === 'MATCH'
                ? 'vs. FC Example'
                : 'Team Meeting'
          }
          placeholderTextColor={neutralColors.textTertiary}
          maxLength={100}
        />

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-04-01"
          placeholderTextColor={neutralColors.textTertiary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        />

        {/* Time */}
        <Text style={styles.label}>Time</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="18:00"
          placeholderTextColor={neutralColors.textTertiary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        />

        {/* Location */}
        <Text style={styles.label}>Location (optional)</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Sportplatz Am Tierpark"
          placeholderTextColor={neutralColors.textTertiary}
          maxLength={200}
        />

        {/* Notes */}
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Bring shin guards..."
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
            <Text style={styles.createButtonText}>Create Event</Text>
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
    marginTop: 24,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
})
