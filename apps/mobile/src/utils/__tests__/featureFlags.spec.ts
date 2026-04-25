import { isFeatureEnabled, setFeatureOverride, clearFeatureOverrides } from '../featureFlags'

describe('featureFlags', () => {
  afterEach(() => clearFeatureOverrides())

  it('returns the default value for a known flag', () => {
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })

  it('respects test-only overrides', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(false)
    setFeatureOverride('anstoss.roleAwareHome', true)
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })

  it('clearFeatureOverrides restores defaults', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    clearFeatureOverrides()
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })
})
