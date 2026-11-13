import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Whether the device can reach the network. Unknown (still probing) counts
 * as online so the offline banner never flashes on launch.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false)
    })
    return unsubscribe
  }, [])
  return online
}
