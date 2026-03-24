import { getClerkInstance } from '@clerk/clerk-expo'
import { Platform } from 'react-native'

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')
const MOBILE_APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0'

type ResponseObserver = (response: Response) => void

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

const responseObservers = new Set<ResponseObserver>()

async function getToken(): Promise<string | null> {
  try {
    return (await getClerkInstance().session?.getToken()) ?? null
  } catch {
    return null
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getToken()
  const { method = 'GET', body, headers = {} } = options

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Version': MOBILE_APP_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  responseObservers.forEach((observer) => observer(res.clone()))

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `API error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export function subscribeToApiResponses(observer: ResponseObserver) {
  responseObservers.add(observer)
  return () => {
    responseObservers.delete(observer)
  }
}

export { API_URL, MOBILE_APP_VERSION, getToken }
