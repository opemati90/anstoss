import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TENANT_SCOPED_MODELS, TENANT_UNSCOPED_MODELS } from './tenant.middleware'

/**
 * Schema-drift guard.
 *
 * Every Prisma model with a `clubId` column is tenant data. It must be
 * consciously classified as either:
 *   - auto-scoped by the tenant middleware (TENANT_SCOPED_MODELS), or
 *   - intentionally unscoped with a documented reason (TENANT_UNSCOPED_MODELS).
 *
 * A clubId-bearing model that is in neither set would read and write completely
 * unscoped with no record of why — a silent cross-tenant leak. This test fails
 * CI the moment such a model is added, forcing the author to classify it.
 */
describe('tenant scoping schema drift', () => {
  function clubIdBearingModels(): string[] {
    const schemaPath = join(__dirname, '..', '..', 'prisma', 'schema.prisma')
    const src = readFileSync(schemaPath, 'utf8')
    const models: string[] = []
    const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
    let match: RegExpExecArray | null
    while ((match = modelRe.exec(src)) !== null) {
      const [, name, body] = match
      // A scalar field literally named `clubId` (not the `club Club` relation).
      if (/^\s*clubId\s+\S/m.test(body)) {
        models.push(name)
      }
    }
    return models
  }

  it('classifies every clubId-bearing model as scoped or intentionally-unscoped', () => {
    const unclassified = clubIdBearingModels().filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !TENANT_UNSCOPED_MODELS.has(m),
    )
    expect(unclassified).toEqual([])
  })

  it('keeps the scoped and unscoped sets disjoint', () => {
    const overlap = [...TENANT_SCOPED_MODELS].filter((m) => TENANT_UNSCOPED_MODELS.has(m))
    expect(overlap).toEqual([])
  })

  it('only classifies models that actually exist in the schema', () => {
    const existing = new Set(clubIdBearingModels())
    const declared = [...TENANT_SCOPED_MODELS, ...TENANT_UNSCOPED_MODELS]
    const stale = declared.filter((m) => !existing.has(m))
    expect(stale).toEqual([])
  })
})
