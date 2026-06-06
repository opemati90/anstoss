export type FeatureFlagName =
  | 'anstoss.roleAwareHome'
  | 'anstoss.newOnboarding'
  // Incomplete/prototype surfaces hidden from MVP (voice memos with no real
  // audio, photo wall with placeholder images, Ehrenamt export stub). Flip on
  // once they're fully built.
  | 'anstoss.experimentalFeatures'

const DEFAULTS: Record<FeatureFlagName, boolean> = {
  'anstoss.roleAwareHome': true,
  'anstoss.newOnboarding': true,
  'anstoss.experimentalFeatures': false,
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
