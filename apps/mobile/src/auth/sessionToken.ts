import * as SecureStore from 'expo-secure-store'

/**
 * Custom email-OTP session token store.
 *
 * Replaces Clerk's session management. The JWT returned by
 * `POST /auth/otp/verify` is the app's durable credential; it is persisted in
 * the device keychain (encrypted at rest) and read back on cold start so the
 * user stays signed in. All authenticated API calls send this token as
 * `Authorization: Bearer <token>`.
 */

const SESSION_TOKEN_KEY = 'anstoss.session.jwt'

// In-memory mirror so the api client's token getter (and any sync consumer)
// can return the token without awaiting SecureStore on every request. Kept in
// lockstep with the persisted value by every setter below.
let memoryToken: string | null = null
let hydrated = false

type Listener = (token: string | null) => void
const listeners = new Set<Listener>()

function emit(token: string | null) {
  listeners.forEach((listener) => {
    try {
      listener(token)
    } catch {
      // a misbehaving subscriber must not break token propagation
    }
  })
}

/** Subscribe to session-token changes (set/clear). Returns an unsubscribe fn. */
export function subscribeSessionToken(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Read the persisted token from SecureStore once on cold start and prime the
 * in-memory mirror. Safe to call repeatedly — only the first call hits the
 * keychain.
 */
export async function hydrateSessionToken(): Promise<string | null> {
  if (hydrated) return memoryToken
  try {
    memoryToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY)
  } catch {
    memoryToken = null
  }
  hydrated = true
  return memoryToken
}

/** Synchronous read of the in-memory token (after hydration). */
export function getSessionTokenSync(): string | null {
  return memoryToken
}

/**
 * Async read of the session token, preferring the in-memory mirror and
 * falling back to a one-time SecureStore hydration. Used by the api client's
 * token getter.
 */
export async function getSessionToken(): Promise<string | null> {
  if (hydrated) return memoryToken
  return hydrateSessionToken()
}

/** Persist a new session token (e.g. after OTP verify or session refresh). */
export async function setSessionToken(token: string): Promise<void> {
  memoryToken = token
  hydrated = true
  emit(token)
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token)
  } catch {
    // SecureStore can fail on some devices — the in-memory token still works
    // for the current session; it just won't survive a cold restart.
  }
}

/** Clear the session token (sign-out / 401). */
export async function clearSessionToken(): Promise<void> {
  memoryToken = null
  hydrated = true
  emit(null)
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY)
  } catch {
    // tolerated — in-memory token is already gone
  }
}
