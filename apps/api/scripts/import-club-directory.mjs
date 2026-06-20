#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

const VALID_SOURCES = new Set(['DFBNET', 'FUSSBALL_DE', 'CSV_IMPORT', 'MANUAL'])

function usage() {
  console.error(
    [
      'Usage: npm run club-directory:import --workspace=@anstoss/api -- <clubs.csv> [--source=CSV_IMPORT]',
      '',
      'Supported headers:',
      'source, sourceId, id, dfbId, name, city, state, postalCode, association, badgeUrl, websiteUrl, primaryColor, slug',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const file = argv.find((arg) => !arg.startsWith('--'))
  const sourceArg = argv.find((arg) => arg.startsWith('--source='))
  const source = sourceArg ? sourceArg.slice('--source='.length) : 'CSV_IMPORT'

  if (!file || !VALID_SOURCES.has(source)) {
    usage()
    process.exit(1)
  }

  return { file, source }
}

function parseCsv(input) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  const [headers, ...body] = rows
  if (!headers) return []

  const normalizedHeaders = headers.map((header) => header.trim())
  return body
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => Object.fromEntries(
      normalizedHeaders.map((header, index) => [header, values[index]?.trim() ?? '']),
    ))
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key]) return row[key]
  }
  return ''
}

function normalizeSearchText(value) {
  return value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeSearchBlob(value) {
  const folded = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return Array.from(new Set([normalizeSearchText(value), folded].filter(Boolean))).join(' ')
}

function slugify(value) {
  return normalizeSearchText(value).replace(/\s+/g, '-').replace(/^-|-$/g, '')
}

function stableSourceId(row, name, city, association) {
  return (
    pick(row, 'sourceId', 'id', 'dfbId') ||
    createHash('sha1').update([name, city, association].join('|')).digest('hex')
  )
}

async function allocateDirectorySlug(prisma, baseSlug, source, sourceId) {
  const slugBase = baseSlug || 'club'
  const [directoryConflicts, clubConflicts] = await Promise.all([
    prisma.clubDirectoryEntry.findMany({
      where: {
        OR: [
          { slug: slugBase },
          { slug: { startsWith: `${slugBase}-` } },
        ],
      },
      select: { slug: true, source: true, sourceId: true },
    }),
    prisma.club.findMany({
      where: {
        OR: [
          { slug: slugBase },
          { slug: { startsWith: `${slugBase}-` } },
        ],
      },
      select: { slug: true },
    }),
  ])

  const ownEntry = directoryConflicts.find(
    (entry) => entry.source === source && entry.sourceId === sourceId,
  )
  if (ownEntry) return ownEntry.slug

  const used = new Set([
    ...directoryConflicts.map((entry) => entry.slug),
    ...clubConflicts.map((entry) => entry.slug),
  ])

  if (!used.has(slugBase)) return slugBase

  let suffix = 2
  while (used.has(`${slugBase}-${suffix}`)) suffix += 1
  return `${slugBase}-${suffix}`
}

async function main() {
  const { file, source: defaultSource } = parseArgs(process.argv.slice(2))
  const text = await readFile(file, 'utf8')
  const rows = parseCsv(text)
  const prisma = new PrismaClient()
  let imported = 0
  let skipped = 0

  try {
    for (const row of rows) {
      const name = pick(row, 'name', 'clubName', 'Verein', 'verein')
      if (!name) {
        skipped += 1
        continue
      }

      const city = pick(row, 'city', 'Ort', 'ort') || null
      const association = pick(row, 'association', 'Verband', 'verband') || null
      const source = VALID_SOURCES.has(row.source) ? row.source : defaultSource
      const sourceId = stableSourceId(row, name, city ?? '', association ?? '')
      const slug = await allocateDirectorySlug(
        prisma,
        pick(row, 'slug') || slugify([name, city].filter(Boolean).join(' ')),
        source,
        sourceId,
      )

      await prisma.clubDirectoryEntry.upsert({
        where: { source_sourceId: { source, sourceId } },
        create: {
          source,
          sourceId,
          name,
          normalizedName: normalizeSearchBlob([name, city, association].filter(Boolean).join(' ')),
          slug,
          city,
          state: pick(row, 'state', 'Bundesland', 'bundesland') || null,
          postalCode: pick(row, 'postalCode', 'plz', 'PLZ') || null,
          association,
          badgeUrl: pick(row, 'badgeUrl') || null,
          websiteUrl: pick(row, 'websiteUrl', 'website') || null,
          primaryColor: pick(row, 'primaryColor') || '#1A1A18',
          lastSeenAt: new Date(),
        },
        update: {
          name,
          normalizedName: normalizeSearchBlob([name, city, association].filter(Boolean).join(' ')),
          slug,
          city,
          state: pick(row, 'state', 'Bundesland', 'bundesland') || null,
          postalCode: pick(row, 'postalCode', 'plz', 'PLZ') || null,
          association,
          badgeUrl: pick(row, 'badgeUrl') || null,
          websiteUrl: pick(row, 'websiteUrl', 'website') || null,
          primaryColor: pick(row, 'primaryColor') || '#1A1A18',
          lastSeenAt: new Date(),
        },
      })

      imported += 1
    }
  } finally {
    await prisma.$disconnect()
  }

  console.log(`Imported ${imported} club directory rows (${skipped} skipped).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
