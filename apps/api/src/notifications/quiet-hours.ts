/** Use the saved wall-clock zone, including DST, not the API host's timezone. */
export function isQuietAt(
  preference: { quietStart: string | null; quietEnd: string | null; quietTimeZone?: string | null },
  now = new Date(),
): boolean {
  const { quietStart: start, quietEnd: end, quietTimeZone } = preference
  if (!start || !end) return false
  // Preserve existing preferences until their owner saves a device timezone.
  let hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (quietTimeZone) {
    try {
      hhmm = new Intl.DateTimeFormat('en-GB', {
        timeZone: quietTimeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now)
    } catch {
      // Bad legacy/imported data must not crash a notification batch.
    }
  }
  return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end
}
