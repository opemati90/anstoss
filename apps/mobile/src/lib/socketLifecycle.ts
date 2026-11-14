import { AppState } from 'react-native'
import type { Socket } from 'socket.io-client'
import { notifyAccessChanged } from '../auth/accessChanges'

/** Socket.IO deliberately does NOT retry an `io server disconnect`.
 * Access changes disconnect sockets server-side, so re-authenticate once.
 * Authorization is still checked for every room/history/send on the server.
 */
export function bindSocketLifecycle(socket: Socket, onForeground?: () => void) {
  let disposed = false
  let retry: ReturnType<typeof setTimeout> | undefined
  const reconnect = () => {
    if (disposed) return
    if (!socket.connected) socket.connect()
    else onForeground?.()
  }
  const disconnected = (reason: string) => {
    if (reason !== 'io server disconnect') return
    notifyAccessChanged()
    clearTimeout(retry)
    retry = setTimeout(() => {
      if (AppState.currentState !== 'background') reconnect()
    }, 1000)
  }
  socket.on('disconnect', disconnected)
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') reconnect()
  })
  return () => {
    disposed = true
    clearTimeout(retry)
    socket.off?.('disconnect', disconnected)
    subscription.remove()
  }
}
