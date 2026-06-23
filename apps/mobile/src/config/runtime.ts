export type RuntimeConfig = {
  apiUrl: string | null
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

export function getRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: readEnvValue(process.env.EXPO_PUBLIC_API_URL),
    appStage: readEnvValue(process.env.EXPO_PUBLIC_APP_STAGE)?.toLowerCase() ?? null,
  }
}

export function evaluateRuntimeConfigIssues(
  config: RuntimeConfig,
): RuntimeConfigIssue[] {
  const issues: RuntimeConfigIssue[] = []

  if (!config.apiUrl) {
    issues.push({
      key: 'EXPO_PUBLIC_API_URL',
      reason: 'Missing API base URL for the packaged app.',
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
