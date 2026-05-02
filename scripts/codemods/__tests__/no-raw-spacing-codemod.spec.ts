import { describe, it, expect } from '@jest/globals'
import jscodeshift from 'jscodeshift'
import transform from '../no-raw-spacing-codemod'

function run(input: string): { source: string; report: string[] } {
  const j = jscodeshift.withParser('tsx')
  const report: string[] = []
  const api: any = {
    jscodeshift: j,
    j,
    stats: () => undefined,
    report: (line: string) => report.push(line),
  }
  const source = transform(
    { source: input, path: 'apps/mobile/app/test.tsx' },
    api,
    {} as any,
  )
  return { source: (source as string) ?? input, report }
}

describe('no-raw-spacing-codemod', () => {
  it('replaces padding: 16 with SPACING_LG', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { padding: 16 } })`)
    expect(source).toContain('SPACING_LG')
    expect(source).not.toMatch(/padding:\s*16/)
  })

  it('replaces gap: 8 with SPACING_SM', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { gap: 8 } })`)
    expect(source).toContain('SPACING_SM')
  })

  it('leaves padding: 0 and borderWidth: 1 untouched', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { padding: 0, borderWidth: 1 } })`)
    expect(source).toContain('padding: 0')
    expect(source).toContain('borderWidth: 1')
  })

  it('reports off-tolerance values without rewriting', () => {
    const { source, report } = run(`const s = StyleSheet.create({ a: { padding: 7 } })`)
    expect(source).toContain('padding: 7')
    expect(report.some((line) => line.includes('padding: 7'))).toBe(true)
  })

  it('does not touch non-spacing properties', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { flex: 1, opacity: 16 } })`)
    expect(source).toContain('flex: 1')
    expect(source).toContain('opacity: 16')
  })
})
