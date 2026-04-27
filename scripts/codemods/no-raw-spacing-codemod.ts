import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import { findNearestSpacingToken, SPACING_TOKENS } from './lib/spacingMatcher'

const SPACING_PROPS = new Set([
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
])

const transform: Transform = (
  file: FileInfo,
  api: API & { report: (line: string) => void },
  _options: Options,
) => {
  if (file.path.includes('/theme/')) return undefined
  const j = api.jscodeshift
  const root = j(file.source)
  const used = new Set<string>()
  let changed = false

  const processProperty = (path: any) => {
    const key = path.node.key as any
    const keyName =
      key.type === 'Identifier'
        ? key.name
        : key.type === 'Literal' || key.type === 'StringLiteral'
          ? String(key.value)
          : null
    if (!keyName || !SPACING_PROPS.has(keyName)) return
    const value = path.node.value as any
    if (value.type !== 'Literal' && value.type !== 'NumericLiteral') return
    const num = value.value
    if (typeof num !== 'number') return
    const match = findNearestSpacingToken(num, SPACING_TOKENS, { tolerance: 1 })
    if (!match) {
      api.report(`${file.path}: ${keyName}: ${num}`)
      return
    }
    if (match.name === '__exempt__') return
    // Build replacement compatible with the current parser's AST
    const newValue = j.identifier(match.name)
    if (path.node.type === 'ObjectProperty') {
      // Babel/TSX parser uses ObjectProperty
      j(path).replaceWith(j.objectProperty(j.identifier(keyName), newValue))
    } else {
      // Recast/esprima uses Property
      j(path).replaceWith(j.property('init', j.identifier(keyName), newValue))
    }
    used.add(match.name)
    changed = true
  }

  // Support both babel-family (ObjectProperty) and esprima-family (Property) parsers
  const propertyCollection = root.find(j.Property)
  if (propertyCollection.size() > 0) {
    propertyCollection.forEach(processProperty)
  } else {
    root.find(j.ObjectProperty).forEach(processProperty)
  }

  if (changed && used.size > 0) {
    const importPath = '../../src/theme/spacing'
    const hasImport = root
      .find(j.ImportDeclaration, { source: { value: importPath } })
      .size() > 0
    if (!hasImport) {
      ;(root.get().node.program.body as any[]).unshift(
        j.importDeclaration(
          [...used].map((n) => j.importSpecifier(j.identifier(n))),
          j.literal(importPath),
        ),
      )
    } else {
      root
        .find(j.ImportDeclaration, { source: { value: importPath } })
        .forEach((p) => {
          const existing = new Set(
            (p.node.specifiers ?? []).map((s) =>
              s.type === 'ImportSpecifier' ? s.imported.name : '',
            ),
          )
          for (const n of used)
            if (!existing.has(n)) p.node.specifiers!.push(j.importSpecifier(j.identifier(n)))
        })
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
