import { describe, it, expect } from '@jest/globals'
import jscodeshift from 'jscodeshift'
import transform from '../no-raw-colors-codemod'

const tokens = { TEXT_PRIMARY: '#1A1C22', SURFACE: '#FFFFFF' }

function run(input: string, path = 'test.tsx'): { source: string; report: string[] } {
  const j = jscodeshift.withParser('tsx')
  const report: string[] = []
  const api = {
    jscodeshift: j,
    j,
    stats: () => undefined,
    report: (line: string) => report.push(line),
  } as any
  const source = transform(
    { source: input, path },
    api,
    { tokens, importPath: '../theme/colors' } as any,
  )
  return { source: (source as string) ?? input, report }
}

describe('no-raw-colors-codemod', () => {
  it('replaces a hex literal with a token reference', () => {
    const { source } = run(`const a = { color: '#1A1C22' }`)
    expect(source).toContain('TEXT_PRIMARY')
    expect(source).not.toContain("'#1A1C22'")
  })

  it('inserts the import if missing', () => {
    const { source } = run(`const a = { color: '#1A1C22' }`)
    expect(source).toContain("from '../theme/colors'")
  })

  it('reports off-tolerance literals without changing the source', () => {
    const { source, report } = run(`const a = { color: '#FF0000' }`)
    expect(source).toContain("'#FF0000'")
    expect(report.some((line) => line.includes('#FF0000'))).toBe(true)
  })

  it('skips literals inside theme/ files (caller-supplied path filter)', () => {
    const { source } = run(
      `const a = { color: '#1A1C22' }`,
      'apps/mobile/src/theme/colors.ts',
    )
    expect(source).toContain("'#1A1C22'")
  })
})
