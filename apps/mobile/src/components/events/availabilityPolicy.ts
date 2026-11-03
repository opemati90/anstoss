export type AvailabilityPolicy = { rsvpDeadline?: string | null; rsvpLocked?: boolean; cancelledAt?: string | null; archivedAt?: string | null; date: string }

export function availabilityClosed(policy: AvailabilityPolicy, now = Date.now()): boolean {
  return Boolean(policy.cancelledAt || policy.archivedAt || policy.rsvpLocked
    || (policy.rsvpDeadline && Math.min(Date.parse(policy.rsvpDeadline), Date.parse(policy.date)) <= now))
}

export function deadlinePreset(date: string, hours: number, now = Date.now()): string | null {
  const deadline = Date.parse(date) - hours * 3600_000
  return Number.isFinite(deadline) && deadline > now ? new Date(deadline).toISOString() : null
}
