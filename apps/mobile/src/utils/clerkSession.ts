import { getClerkInstance } from '@clerk/clerk-expo'

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_INITIAL_INTERVAL_MS = 100

type WaitForSessionTokenOptions = {
  timeoutMs?: number
  initialIntervalMs?: number
  getToken?: () => Promise<string | null>
}

async function readSessionToken() {
  try {
    return (await getClerkInstance().session?.getToken()) ?? null
  } catch {
    return null
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function waitForSessionToken(
  options: WaitForSessionTokenOptions = {},
): Promise<string | null> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    initialIntervalMs = DEFAULT_INITIAL_INTERVAL_MS,
    getToken = readSessionToken,
  } = options
  const deadline = Date.now() + timeoutMs
  const MAX_INTERVAL_MS = 800
  let currentInterval = initialIntervalMs

  while (Date.now() <= deadline) {
    const token = await getToken()
    if (token) {
      return token
    }

    if (Date.now() + currentInterval > deadline) {
      break
    }

    await delay(currentInterval)
    currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL_MS)
  }

  return getToken()
}
