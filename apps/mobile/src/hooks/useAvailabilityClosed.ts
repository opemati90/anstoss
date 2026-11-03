import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { availabilityClosed, type AvailabilityPolicy } from '../components/events/availabilityPolicy'

export function useAvailabilityClosed(policy: AvailabilityPolicy | null) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!policy) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now())
    })
    return () => subscription.remove()
  }, [Boolean(policy)])
  useEffect(() => {
    if (!policy?.rsvpDeadline) return
    const closesAt = Math.min(Date.parse(policy.rsvpDeadline), Date.parse(policy.date))
    const remaining = closesAt - Date.now()
    if (remaining <= 0 || !Number.isFinite(remaining)) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(remaining + 1, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [policy?.rsvpDeadline, policy?.date, now])
  return policy ? availabilityClosed(policy, Math.max(now, Date.now())) : false
}
