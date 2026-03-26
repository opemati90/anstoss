export type RuntimeConfig = {
  apiUrl: string | null
  clerkPublishableKey: string | null
}

function readEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: readEnvValue(process.env.EXPO_PUBLIC_API_URL),
    clerkPublishableKey: readEnvValue(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY),
  }
}

export function getMissingRequiredRuntimeConfig() {
  const config = getRuntimeConfig()
  const missing: string[] = []

  if (!config.apiUrl) {
    missing.push('EXPO_PUBLIC_API_URL')
  }

  if (!config.clerkPublishableKey) {
    missing.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')
  }

  return missing
}
