import { getClerkInstance } from '@clerk/clerk-expo'

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_INTERVAL_MS = 150

type WaitForSessionTokenOptions = {
  timeoutMs?: number
  intervalMs?: number
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
    intervalMs = DEFAULT_INTERVAL_MS,
    getToken = readSessionToken,
  } = options
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const token = await getToken()
    if (token) {
      return token
    }

    if (Date.now() + intervalMs > deadline) {
      break
    }

    await delay(intervalMs)
  }

  return getToken()
}
