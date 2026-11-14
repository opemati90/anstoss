// Gateways disconnect an account's sockets when its permissions change.
// Keep this leaf module independent of AuthContext to avoid import cycles.
const listeners = new Set<() => void>()

export function notifyAccessChanged() {
  for (const listener of listeners) listener()
}

export function subscribeAccessChanges(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
