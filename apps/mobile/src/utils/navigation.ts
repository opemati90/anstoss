import { router as expoRouter, type Href } from 'expo-router'

type BackRouter = Pick<typeof expoRouter, 'back' | 'canGoBack' | 'replace'>

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
