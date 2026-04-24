export type FeatureFlagName = 'anstoss.roleAwareHome'

const DEFAULTS: Record<FeatureFlagName, boolean> = {
  'anstoss.roleAwareHome': true,
}

const overrides: Partial<Record<FeatureFlagName, boolean>> = {}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  if (name in overrides) {
    return overrides[name] as boolean
  }
  return DEFAULTS[name]
}

export function setFeatureOverride(name: FeatureFlagName, value: boolean): void {
  overrides[name] = value
}

export function clearFeatureOverrides(): void {
  for (const key of Object.keys(overrides) as FeatureFlagName[]) {
    delete overrides[key]
  }
}
