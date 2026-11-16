import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Ephemeral presence only: no draft text, persistence or cross-thread state. */
export function useTypingPresence(scope: string, timeoutMs: number) {
  const [people, setPeople] = useState<Record<string, string>>({})
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const remove = useCallback((userId: string | null) => {
    if (!userId) return
    clearTimeout(timers.current.get(userId))
    timers.current.delete(userId)
    setPeople(previous => {
      if (!(userId in previous)) return previous
      const next = { ...previous }
      delete next[userId]
      return next
    })
  }, [])
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
    setPeople(previous => Object.keys(previous).length ? {} : previous)
  }, [])
  const touch = useCallback((userId: string, name: string) => {
    if (!userId || !name) return
    clearTimeout(timers.current.get(userId))
    setPeople(previous => previous[userId] === name ? previous : { ...previous, [userId]: name })
    timers.current.set(userId, setTimeout(() => remove(userId), timeoutMs))
  }, [remove, timeoutMs])
  useEffect(() => {
    clear()
    return clear
  }, [scope, clear])
  // ChatScreen reports these names to its parent header in an effect. Keep the
  // array stable when presence is unchanged, or that feedback can render-loop.
  const names = useMemo(() => Object.values(people), [people])
  return { names, touch, remove, clear }
}
