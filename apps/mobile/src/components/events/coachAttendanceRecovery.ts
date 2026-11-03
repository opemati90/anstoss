import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, ApiError } from '../../api/client'

export type PendingAttendance = { userId: string; status: 'PRESENT' | 'ABSENT' | 'UNKNOWN'; expectedVersion: number | null; operationId: string }
export type AttendanceResult = { userId: string; status: string; version: number } | { settled: true; rejected?: boolean }

const scopeLocks = new Map<string, Promise<void>>()
const retiredActors = new Set<string>()
const recoveryScans = new Map<string, Promise<void>>()
const recoveryCursors = new Map<string, number>()
const cleanupPrefix = '@anstoss/coach-attendance-cleanup/'
export function isAttendanceActorRetired(actorId: string) { return retiredActors.has(actorId) }
export async function withAttendanceLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prior = scopeLocks.get(key)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  scopeLocks.set(key, gate)
  if (prior) await prior
  try { return await work() } finally {
    release()
    if (scopeLocks.get(key) === gate) scopeLocks.delete(key)
  }
}

export function attendanceJournalKey(actorId: string, clubId: string, eventId: string) {
  return `@anstoss/coach-attendance/${encodeURIComponent(actorId)}/${encodeURIComponent(clubId)}/${encodeURIComponent(eventId)}`
}

export async function settleAttendanceJournal(key: string, endpoint: string, actorId: string): Promise<boolean> {
  if (retiredActors.has(actorId)) throw new Error('Account unavailable')
  const raw = await AsyncStorage.getItem(key)
  if (!raw) return false
  const pending = JSON.parse(raw) as PendingAttendance
  let rejected: boolean
  try {
    const result = await api<AttendanceResult>(`${endpoint}/${encodeURIComponent(pending.userId)}`, {
      method: 'PUT', body: { status: pending.status, expectedVersion: pending.expectedVersion, operationId: pending.operationId, expectedActorId: actorId },
    })
    rejected = 'rejected' in result && Boolean(result.rejected)
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error
    rejected = true
  }
  if (rejected) await AsyncStorage.setItem(`${key}/rejected/${pending.operationId}`, pending.operationId)
  await AsyncStorage.removeItem(key)
  return rejected
}

/** Retry only this signed-in actor's durable operations; the API binds every
 * request to that same actor even if the token changes during a retry. */
export async function recoverAttendanceJournals(actorId: string) {
  if (retiredActors.has(actorId)) return
  const existing = recoveryScans.get(actorId)
  if (existing) return existing
  const scan = scanAttendanceJournals(actorId)
  recoveryScans.set(actorId, scan)
  try { await scan } finally { if (recoveryScans.get(actorId) === scan) recoveryScans.delete(actorId) }
}

async function scanAttendanceJournals(actorId: string) {
  const prefix = `@anstoss/coach-attendance/${encodeURIComponent(actorId)}/`
  const allKeys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix) && !key.includes('/rejected/')).sort()
  const start = allKeys.length ? (recoveryCursors.get(actorId) ?? 0) % allKeys.length : 0
  const keys = [...allKeys.slice(start), ...allKeys.slice(0, start)].slice(0, 20)
  if (allKeys.length) recoveryCursors.set(actorId, (start + keys.length) % allKeys.length)
  for (const key of keys) {
    if (retiredActors.has(actorId)) return
    const parts = key.slice(prefix.length).split('/')
    if (parts.length !== 2) continue
    try {
      const clubId = decodeURIComponent(parts[0])
      const eventId = decodeURIComponent(parts[1])
      if (!clubId || !eventId) continue
      const endpoint = `/clubs/${encodeURIComponent(clubId)}/events/${encodeURIComponent(eventId)}/coach-attendance`
      await withAttendanceLock(key, () => settleAttendanceJournal(key, endpoint, actorId))
    } catch {
      // Offline, revoked and ambiguous cases stay journaled for a later retry.
    }
  }
}

/** Call only after the server confirms deletion; all local writes participate
 * in these locks and the retired guard prevents a late write from recreating it. */
export async function clearDeletedActorAttendance(actorId: string) {
  retiredActors.add(actorId)
  const prefix = `@anstoss/coach-attendance/${encodeURIComponent(actorId)}/`
  const keys = [...(await AsyncStorage.getAllKeys()), ...scopeLocks.keys()].filter((key) => key.startsWith(prefix))
  const baseKeys = [...new Set(keys.map((key) => key.split('/rejected/')[0]))]
  for (const key of baseKeys) {
    await withAttendanceLock(key, async () => {
      await AsyncStorage.removeItem(key)
      const noticeKeys = (await AsyncStorage.getAllKeys()).filter((notice) => notice.startsWith(`${key}/rejected/`))
      for (const notice of noticeKeys) await AsyncStorage.removeItem(notice)
    })
  }
}

export async function completeDeletedActorAttendanceCleanup(actorId: string) {
  const marker = `${cleanupPrefix}${encodeURIComponent(actorId)}`
  await AsyncStorage.setItem(marker, 'confirmed')
  await clearDeletedActorAttendance(actorId)
  await AsyncStorage.removeItem(marker)
}

/** Resume local cleanup after confirmed deletion and a crash or storage failure. */
export async function resumeConfirmedAttendanceCleanup() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(cleanupPrefix))
  for (const key of keys) {
    try {
      const state = await AsyncStorage.getItem(key)
      if (state !== 'confirmed') continue
      const actorId = decodeURIComponent(key.slice(cleanupPrefix.length))
      if (!actorId) continue
      await clearDeletedActorAttendance(actorId)
      await AsyncStorage.removeItem(key)
    } catch {
      // Preserve marker for the next launch.
    }
  }
}

export async function listAttendanceRejections(actorId: string): Promise<Array<{ key: string; operationId: string }>> {
  const prefix = `@anstoss/coach-attendance/${encodeURIComponent(actorId)}/`
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix) && key.includes('/rejected/'))
  const notices = await Promise.all(keys.map(async (key) => ({ key, operationId: await AsyncStorage.getItem(key) })))
  return notices.filter((item): item is { key: string; operationId: string } => Boolean(item.operationId))
}

export async function acknowledgeAttendanceRejections(notices: Array<{ key: string; operationId: string }>) {
  for (const notice of notices) {
    const base = notice.key.split('/rejected/')[0]
    await withAttendanceLock(base, async () => {
      if (await AsyncStorage.getItem(notice.key) === notice.operationId) await AsyncStorage.removeItem(notice.key)
    })
  }
}
