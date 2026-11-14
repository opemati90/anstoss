// Foreground notifications invalidate data; they are not just banners.
const listeners = new Set<() => void>()

export function notifyNotificationReceived() {
  for (const listener of listeners) listener()
}

export function subscribeNotifications(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
