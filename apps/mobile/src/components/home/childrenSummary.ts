import { useSyncExternalStore } from 'react'

/**
 * Who a parent is acting for, e.g. [{ name: 'Leo', team: 'U15' }].
 *
 * ParentHome learns this from /me/children-events; the shared header in
 * app/(tabs)/_layout.tsx reads it so a parent sees "Leo · U15" instead of the
 * parent's own (irrelevant) team membership. Module-level on purpose: the
 * home tab is always mounted (tabs are not lazy), so the header never needs
 * its own request.
 */
export type ChildSummary = { id: string; name: string; team: string }

let current: ChildSummary[] = []
const listeners = new Set<() => void>()

export function setChildrenSummary(next: ChildSummary[]) {
  const same =
    next.length === current.length &&
    next.every(
      (child, i) =>
        child.id === current[i]?.id &&
        child.name === current[i]?.name &&
        child.team === current[i]?.team,
    )
  if (same) return
  current = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => current

export function useChildrenSummary(): ChildSummary[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** "Leo · U15, Mia · U11" */
export function formatChildrenSummary(children: ChildSummary[]): string {
  return children
    .map((child) => [child.name, child.team].filter(Boolean).join(' · '))
    .join(', ')
}
