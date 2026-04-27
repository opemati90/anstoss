import { describe, it, expect } from '@jest/globals'
import { findMissingAuditRows } from '../audit-coverage'

describe('audit-coverage', () => {
  it('returns screen files that have no row in audit.md', () => {
    const screenFiles = [
      'apps/mobile/app/(tabs)/index.tsx',
      'apps/mobile/app/(tabs)/events/index.tsx',
      'apps/mobile/app/edit-profile.tsx',
    ]
    const auditMarkdown = `
| Screen | Tokens | Typography |
|---|---|---|
| apps/mobile/app/(tabs)/index.tsx | PASS | PASS |
| apps/mobile/app/edit-profile.tsx | FAIL | PASS |
`
    expect(findMissingAuditRows(screenFiles, auditMarkdown)).toEqual([
      'apps/mobile/app/(tabs)/events/index.tsx',
    ])
  })

  it('returns empty when every screen is covered', () => {
    const screenFiles = ['apps/mobile/app/sign-in.tsx']
    const auditMarkdown = '| apps/mobile/app/sign-in.tsx | PASS |'
    expect(findMissingAuditRows(screenFiles, auditMarkdown)).toEqual([])
  })

  it('excludes _layout.tsx, __tests__ paths, and e2e.tsx from eligibility', () => {
    const screenFiles = [
      'apps/mobile/app/_layout.tsx',
      'apps/mobile/app/(tabs)/_layout.tsx',
      'apps/mobile/app/__tests__/home.spec.tsx',
      'apps/mobile/app/e2e.tsx',
      'apps/mobile/app/home.tsx',
    ]
    expect(findMissingAuditRows(screenFiles, '')).toEqual([
      'apps/mobile/app/home.tsx',
    ])
  })
})
