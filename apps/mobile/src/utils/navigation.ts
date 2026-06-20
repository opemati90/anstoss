import type { Href, Router } from 'expo-router'

type BackRouter = Pick<Router, 'back' | 'canGoBack' | 'replace'>

export function goBackOrReplace(router: BackRouter, fallback: Href = '/') {
  let canGoBack: boolean

  try {
    canGoBack = router.canGoBack()
  } catch {
    canGoBack = false
  }

  if (canGoBack) {
    router.back()
    return
  }

  router.replace(fallback)
}
