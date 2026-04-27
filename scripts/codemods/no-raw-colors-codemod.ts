import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import { findNearestToken, type TokenMap } from './lib/colorMatcher'

type CodemodOptions = {
  tokens: TokenMap
  importPath: string
}

const transform: Transform = (
  file: FileInfo,
  api: API & { report: (line: string) => void },
  options: Options & CodemodOptions,
) => {
  if (file.path.includes('/theme/')) return undefined
  const j = api.jscodeshift
  const root = j(file.source)
  const usedTokens = new Set<string>()
  let changed = false

  root.find(j.Literal).forEach((path) => {
    const value = path.node.value
    if (typeof value !== 'string') return
    if (!/^#[0-9a-fA-F]{3,8}$|^rgba?\(/.test(value)) return
    const match = findNearestToken(value, options.tokens)
    if (!match) {
      api.report(`${file.path}: off-tolerance literal "${value}"`)
      return
    }
    j(path).replaceWith(j.identifier(match.name))
    usedTokens.add(match.name)
    changed = true
  })

  if (changed && usedTokens.size > 0) {
    const hasImport = root
      .find(j.ImportDeclaration, { source: { value: options.importPath } })
      .size() > 0
    if (!hasImport) {
      const decl = j.importDeclaration(
        [...usedTokens].map((name) => j.importSpecifier(j.identifier(name))),
        j.literal(options.importPath),
      )
      root.get().node.program.body.unshift(decl)
    } else {
      root
        .find(j.ImportDeclaration, { source: { value: options.importPath } })
        .forEach((p) => {
          const existing = new Set(
            (p.node.specifiers ?? []).map((s) =>
              s.type === 'ImportSpecifier' ? s.imported.name : '',
            ),
          )
          for (const name of usedTokens) {
            if (!existing.has(name)) {
              p.node.specifiers!.push(j.importSpecifier(j.identifier(name)))
            }
          }
        })
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
