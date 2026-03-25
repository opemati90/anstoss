import { useCallback, useState } from 'react'
import { Platform, Linking } from 'react-native'

const APP_STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/anstoss/id0000000000', // Replace with real ID
  android: 'https://play.google.com/store/apps/details?id=com.anstoss.app',
}) || ''

interface UpdateState {
  forceUpdate: boolean
  softUpdate: boolean
  minVersion?: string
  recommendedVersion?: string
}

export function getUpdateStateFromResponse(
  response: Pick<Response, 'status' | 'headers'>,
  body?: { error?: { minVersion?: string } },
): UpdateState | null {
  if (response.status === 426) {
    return {
      forceUpdate: true,
      softUpdate: false,
      minVersion: body?.error?.minVersion,
    }
  }

  const recommendedVersion = response.headers.get('x-update-available')
  if (recommendedVersion) {
    return {
      forceUpdate: false,
      softUpdate: true,
      recommendedVersion,
    }
  }

  return null
}

/**
 * Intercepts API responses to detect version requirements.
 *
 * - 426 status → forceUpdate = true (full-screen blocker)
 * - X-Update-Available header → softUpdate = true (dismissible banner)
 */
export function useUpdateCheck() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    forceUpdate: false,
    softUpdate: false,
  })

  const checkResponse = useCallback((response: Response) => {
    if (response.status === 426) {
      response.json().then((body) => {
        const nextState = getUpdateStateFromResponse(response, body)
        if (nextState) {
          setUpdateState(nextState)
        }
      }).catch(() => {
        setUpdateState({ forceUpdate: true, softUpdate: false })
      })
      return
    }

    const nextState = getUpdateStateFromResponse(response)
    if (nextState?.softUpdate) {
      setUpdateState((prev) => ({
        ...prev,
        softUpdate: true,
        recommendedVersion: nextState.recommendedVersion,
      }))
    }
  }, [])

  const openStore = useCallback(() => {
    Linking.openURL(APP_STORE_URL).catch(() => {
      // Store link failed — nothing we can do
    })
  }, [])

  const dismissSoftUpdate = useCallback(() => {
    setUpdateState((prev) => ({ ...prev, softUpdate: false }))
  }, [])

  return {
    ...updateState,
    checkResponse,
    openStore,
    dismissSoftUpdate,
  }
}
