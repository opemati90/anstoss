import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Linking } from 'react-native'
import { setResponseChecker } from '../api/client'

const APP_STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/anstoss/id6761143230',
  android: 'https://play.google.com/store/apps/details?id=com.renuirug.anstoss',
}) || ''

interface UpdateState {
  forceUpdate: boolean
  softUpdate: boolean
  minVersion?: string
  recommendedVersion?: string
  forceUpdateMessage?: string
  announcement?: string
}

type UpdateErrorBody = {
  error?: { minVersion?: string; message?: string }
}

export function getUpdateStateFromResponse(
  response: Pick<Response, 'status' | 'headers'>,
  body?: UpdateErrorBody,
): UpdateState | null {
  if (response.status === 426) {
    return {
      forceUpdate: true,
      softUpdate: false,
      minVersion: body?.error?.minVersion,
      forceUpdateMessage: body?.error?.message,
    }
  }

  const recommendedVersion = response.headers.get('x-update-available')
  const encodedAnnouncement = response.headers.get('x-anstoss-announcement')
  const announcement = decodeHeaderValue(encodedAnnouncement)
  return {
    forceUpdate: false,
    softUpdate: Boolean(recommendedVersion),
    recommendedVersion: recommendedVersion ?? undefined,
    announcement: announcement || undefined,
  }
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
  const dismissedRecommendedVersionRef = useRef<string | undefined>(undefined)
  const dismissedAnnouncementRef = useRef<string | undefined>(undefined)

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
    if (!nextState) return

    if (!nextState.recommendedVersion) {
      dismissedRecommendedVersionRef.current = undefined
    }
    if (!nextState.announcement) {
      dismissedAnnouncementRef.current = undefined
    }
    setUpdateState({
      ...nextState,
      softUpdate:
        nextState.softUpdate &&
        nextState.recommendedVersion !== dismissedRecommendedVersionRef.current,
      announcement:
        nextState.announcement === dismissedAnnouncementRef.current
          ? undefined
          : nextState.announcement,
    })
  }, [])

  const openStore = useCallback(() => {
    Linking.openURL(APP_STORE_URL).catch(() => {
      // Store link failed — nothing we can do
    })
  }, [])

  // Register the checker so every api() call is intercepted
  useEffect(() => {
    setResponseChecker(checkResponse)
    return () => setResponseChecker(null)
  }, [checkResponse])

  const dismissSoftUpdate = useCallback(() => {
    setUpdateState((prev) => {
      dismissedRecommendedVersionRef.current = prev.recommendedVersion
      return { ...prev, softUpdate: false }
    })
  }, [])

  const dismissAnnouncement = useCallback(() => {
    setUpdateState((prev) => {
      dismissedAnnouncementRef.current = prev.announcement
      return { ...prev, announcement: undefined }
    })
  }, [])

  return {
    ...updateState,
    checkResponse,
    openStore,
    dismissSoftUpdate,
    dismissAnnouncement,
  }
}

function decodeHeaderValue(value: string | null) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
