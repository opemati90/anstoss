import { useCallback, useEffect, useRef } from 'react'

/** Keep a newly sent message visible without moving the list for incoming messages. */
export function useOwnMessageScroll(
  latestId: string | undefined,
  latestSenderId: string | null | undefined,
  userId: string | null | undefined,
  scrollToLatest: () => void,
) {
  const armed = useRef(false)
  const scheduled = useRef(new Set<number>())
  const armTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arm = useCallback(() => {
    armed.current = true
    if (armTimeout.current) clearTimeout(armTimeout.current)
    armTimeout.current = setTimeout(() => { armed.current = false; armTimeout.current = null }, 10_000)
  }, [])
  const cancel = useCallback(() => {
    armed.current = false
    if (armTimeout.current) clearTimeout(armTimeout.current)
    armTimeout.current = null
    for (const frame of scheduled.current) cancelAnimationFrame(frame)
    scheduled.current.clear()
  }, [])

  useEffect(() => {
    if (!armed.current || !latestId || !userId || latestSenderId !== userId) return
    armed.current = false
    if (armTimeout.current) clearTimeout(armTimeout.current)
    armTimeout.current = null
    const firstFrame = requestAnimationFrame(() => {
      if (!scheduled.current.delete(firstFrame)) return
      scrollToLatest()
      const secondFrame = requestAnimationFrame(() => {
        if (!scheduled.current.delete(secondFrame)) return
        scrollToLatest()
      })
      scheduled.current.add(secondFrame)
    })
    scheduled.current.add(firstFrame)
  }, [latestId, latestSenderId, scrollToLatest, userId])

  useEffect(() => () => cancel(), [cancel])

  return { arm, cancel }
}
