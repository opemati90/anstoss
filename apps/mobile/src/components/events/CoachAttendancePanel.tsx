import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import type { EventSquadMember } from '@anstoss/shared'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { Avatar } from '../ui/Avatar'
import { Text } from '../ui'
import { acknowledgeAttendanceRejections, attendanceJournalKey, isAttendanceActorRetired, listAttendanceRejections, settleAttendanceJournal, withAttendanceLock, type PendingAttendance, type AttendanceResult } from './coachAttendanceRecovery'

type Status = 'PRESENT' | 'ABSENT' | 'UNKNOWN'
type RecordRow = { userId: string; status: Status; version: number }

/** Coach observation is separate from the player's availability and check-in. */
export function CoachAttendancePanel({ clubId, eventId, actorId, members }: {
  clubId: string
  eventId: string
  actorId: string
  members: EventSquadMember[]
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [records, setRecords] = useState<Record<string, RecordRow>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const mounted = useRef(false)
  const busy = useRef(false)
  const endpoint = `/clubs/${clubId}/events/${eventId}/coach-attendance`
  const pendingKey = attendanceJournalKey(actorId, clubId, eventId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const rows = await withAttendanceLock(pendingKey, async () => {
        await settleAttendanceJournal(pendingKey, endpoint, actorId)
        const rejectionId = (await listAttendanceRejections(actorId)).find((notice) => notice.key.startsWith(`${pendingKey}/rejected/`))?.operationId
        if (rejectionId) {
          if (mounted.current) setRejected(rejectionId)
          throw new Error('Attendance operation rejected')
        }
        return api<RecordRow[]>(`${endpoint}?expectedActorId=${encodeURIComponent(actorId)}`)
      })
      if (mounted.current) setRecords(Object.fromEntries(rows.map((row) => [row.userId, row])))
    } catch {
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [actorId, endpoint, pendingKey])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false }
  }, [load])

  const record = async (userId: string, status: Status) => {
    if (busy.current) return
    busy.current = true
    setSaving(userId)
    setError(false)
    try {
      const pending: PendingAttendance = { userId, status, expectedVersion: records[userId]?.version ?? null, operationId: randomUUID() }
      // Never send an operation that cannot be recovered after process death.
      const rows = await withAttendanceLock(pendingKey, async () => {
        if (await settleAttendanceJournal(pendingKey, endpoint, actorId)) {
          if (mounted.current) setRejected((await listAttendanceRejections(actorId)).find((notice) => notice.key.startsWith(`${pendingKey}/rejected/`))?.operationId ?? null)
          throw new Error('Attendance operation rejected')
        }
        if (isAttendanceActorRetired(actorId)) throw new Error('Account unavailable')
        await AsyncStorage.setItem(pendingKey, JSON.stringify(pending))
        const result = await api<AttendanceResult>(`${endpoint}/${encodeURIComponent(userId)}`, {
          method: 'PUT', body: { status, expectedVersion: pending.expectedVersion, operationId: pending.operationId, expectedActorId: actorId },
        })
        if ('rejected' in result && result.rejected) {
          await AsyncStorage.setItem(`${pendingKey}/rejected/${pending.operationId}`, pending.operationId)
          await AsyncStorage.removeItem(pendingKey)
          if (mounted.current) setRejected(pending.operationId)
          throw new Error('Attendance operation rejected')
        }
        await AsyncStorage.removeItem(pendingKey)
        return api<RecordRow[]>(`${endpoint}?expectedActorId=${encodeURIComponent(actorId)}`)
      })
      if (mounted.current) setRecords(Object.fromEntries(rows.map((row) => [row.userId, row])))
    } catch {
      // Leave the durable operation intact; the next load retries exactly it.
      if (mounted.current) setError(true)
    } finally {
      busy.current = false
      if (mounted.current) setSaving(null)
    }
  }

  return (
    <View style={styles.section}>
      <Text variant="headline" weight="semibold" color="primary">{t('event.coachAttendance.title')}</Text>
      <Text variant="footnote" color="secondary" style={styles.description}>{t('event.coachAttendance.description')}</Text>
      {loading ? <ActivityIndicator color={c.primary} /> : error ? (
        <Pressable accessibilityRole="button" onPress={() => {
          if (!rejected) { void load(); return }
          void acknowledgeAttendanceRejections([{ key: `${pendingKey}/rejected/${rejected}`, operationId: rejected }])
            .then(() => { if (mounted.current) { setRejected(null); void load() } })
            .catch(() => { if (mounted.current) setError(true) })
        }} style={styles.retry}>
          <Text color="error">{t(rejected ? 'event.coachAttendanceRejected' : 'event.coachAttendance.retry')}</Text>
        </Pressable>
      ) : members.length === 0 ? (
        <Text variant="footnote" color="secondary">{t('event.coachAttendance.empty')}</Text>
      ) : members.map((member) => (
        <View key={member.userId} style={[styles.row, { borderBottomColor: c.borderDefault }]}>
          <View style={styles.identity}>
            <Avatar size="sm" src={member.avatarUrl} fallbackText={member.name} />
            <Text variant="body" color="primary" style={styles.name}>{member.name}</Text>
          </View>
          <View style={styles.choices}>
            {(['PRESENT', 'ABSENT', 'UNKNOWN'] as const).map((status) => {
              const selected = (records[member.userId]?.status ?? 'UNKNOWN') === status
              return (
                <Pressable key={status} accessibilityRole="radio" accessibilityState={{ selected, disabled: saving !== null }}
                  accessibilityLabel={t(`event.coachAttendance.${status.toLowerCase()}`, { name: member.name })}
                  disabled={saving !== null} onPress={() => void record(member.userId, status)}
                  style={[styles.choice, { borderColor: selected ? c.primary : c.borderDefault, backgroundColor: selected ? c.primary50 : c.surface }]}>
                  <Text variant="footnote" weight={selected ? 'semibold' : 'regular'} color={selected ? 'tint' : 'secondary'}>
                    {t(`event.coachAttendance.${status.toLowerCase()}Label`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: space.lg, gap: space.sm },
  description: { marginBottom: space.xs },
  retry: { minHeight: 44, justifyContent: 'center' },
  row: { borderBottomWidth: hairline, paddingVertical: space.sm, gap: space.xs },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  choice: { minHeight: 44, flexGrow: 1, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center', borderWidth: hairline, borderRadius: radius.md, borderCurve: 'continuous' },
})
