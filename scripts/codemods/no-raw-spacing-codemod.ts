import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import * as path from 'path'
import { findNearestSpacingToken, SPACING_TOKENS } from './lib/spacingMatcher'

function computeSpacingImportPath(filePath: string): string {
  // Resolve the absolute path of the spacing module relative to the file under transform.
  const themeAbs = path.resolve(process.cwd(), 'apps/mobile/src/theme/spacing')
  const fileDir = path.dirname(path.resolve(filePath))
  let rel = path.relative(fileDir, themeAbs)
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

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
    // Symbols may already be imported via the tokens barrel re-export;
    // collect every existing import that brings them in to avoid duplicates.
    const alreadyImported = new Set<string>()
    root.find(j.ImportDeclaration).forEach((p) => {
      for (const s of p.node.specifiers ?? []) {
        if (s.type !== 'ImportSpecifier') continue
        const importedName =
          s.imported.type === 'Identifier' ? s.imported.name : null
        if (importedName && used.has(importedName)) {
          alreadyImported.add(importedName)
        }
      }
    })

    const stillNeeded = [...used].filter((n) => !alreadyImported.has(n))
    if (stillNeeded.length === 0) {
      return changed ? root.toSource({ quote: 'single' }) : undefined
    }

    const importPath = computeSpacingImportPath(file.path)
    const hasImport = root
      .find(j.ImportDeclaration, { source: { value: importPath } })
      .size() > 0
    if (!hasImport) {
      ;(root.get().node.program.body as any[]).unshift(
        j.importDeclaration(
          stillNeeded.map((n) => j.importSpecifier(j.identifier(n))),
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
          for (const n of stillNeeded)
            if (!existing.has(n)) p.node.specifiers!.push(j.importSpecifier(j.identifier(n)))
        })
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
