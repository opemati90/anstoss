export type RuntimeConfig = {
  apiUrl: string | null
  clerkPublishableKey: string | null
  appStage: string | null
}

export type RuntimeConfigIssue = {
  key: string
  reason: string
}

function readEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function isReleaseBuild() {
  if (typeof __DEV__ === 'boolean') {
    return !__DEV__
  }

  return process.env.NODE_ENV === 'production'
}

function isUnsafeClerkPublishableKey(key: string) {
  return key.startsWith('pk_test_') || key.includes('.clerk.accounts.dev')
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: readEnvValue(process.env.EXPO_PUBLIC_API_URL),
    clerkPublishableKey: readEnvValue(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY),
    appStage: readEnvValue(process.env.EXPO_PUBLIC_APP_STAGE)?.toLowerCase() ?? null,
  }
}

function shouldEnforceLiveClerkKey(
  config: RuntimeConfig,
  options?: { releaseBuild?: boolean },
) {
  const releaseBuild = options?.releaseBuild ?? isReleaseBuild()
  if (!releaseBuild) return false

  // TestFlight/preview are still release binaries, but they're internal QA
  // channels and may intentionally point at a non-live Clerk instance.
  if (config.appStage && config.appStage !== 'production') {
    return false
  }

  return true
}

export function evaluateRuntimeConfigIssues(
  config: RuntimeConfig,
  options?: { releaseBuild?: boolean },
): RuntimeConfigIssue[] {
  const issues: RuntimeConfigIssue[] = []

  if (!config.apiUrl) {
    issues.push({
      key: 'EXPO_PUBLIC_API_URL',
      reason: 'Missing API base URL for the packaged app.',
    })
  }

  if (!config.clerkPublishableKey) {
    issues.push({
      key: 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
      reason: 'Missing Clerk publishable key for email-code sign-in.',
    })
  } else if (
    shouldEnforceLiveClerkKey(config, options) &&
    isUnsafeClerkPublishableKey(config.clerkPublishableKey)
  ) {
    issues.push({
      key: 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
      reason: 'This key points to a Clerk test or development instance. Use the live production Clerk key before shipping a release build.',
    })
  }

  return issues
}

export function getRuntimeConfigIssues(): RuntimeConfigIssue[] {
  return evaluateRuntimeConfigIssues(getRuntimeConfig())
}

export function getMissingRequiredRuntimeConfig() {
  return getRuntimeConfigIssues().map((issue) => issue.key)
}
