import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('clerk_token')
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `API error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export { API_URL, getToken }
