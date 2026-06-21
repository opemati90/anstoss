#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { Prisma, PrismaClient } from '@prisma/client'

const VALID_STATUS = new Set([
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
  'UNKNOWN',
])

const VALID_CONFIDENCE = new Set([
  'OFFICIAL_PARTNER',
  'OFFICIAL_WIDGET',
  'UNOFFICIAL_PUBLIC',
  'COMMUNITY_OPEN',
  'CLUB_ENTERED',
  'MIXED',
])

function usage() {
  console.error(
    [
      'Usage: npm run fixture-feed:import --workspace=@anstoss/api -- <feed.json> --club-id=<clubId> --team-id=<teamId>',
      '',
      'Feed shape:',
      '{',
      '  "sourceName": "Licensed provider export 2026-06-21",',
      '  "team": { "externalTeamId": "provider-team-1", "label": "SV Beispiel", "externalUrl": "https://provider.example/team/1" },',
      '  "fixtures": [',
      '    {',
      '      "externalMatchId": "match-1",',
      '      "competition": "Kreisliga A",',
      '      "kickoffAt": "2026-06-21T13:00:00.000Z",',
      '      "status": "live",',
      '      "homeTeam": "SV Beispiel",',
      '      "awayTeam": "FC Test",',
      '      "resultHome": 1,',
      '      "resultAway": 0,',
      '      "timeline": [{ "minute": 12, "kind": "goal", "side": "home", "player": "Max Beispiel" }],',
      '      "lineup": { "home": { "formation": "4-3-3", "starters": [{ "number": 9, "name": "Max Beispiel" }] } }',
      '    }',
      '  ]',
      '}',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const file = argv.find((arg) => !arg.startsWith('--'))
  const args = new Map()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const index = arg.indexOf('=')
    if (index === -1) continue
    args.set(arg.slice(2, index), arg.slice(index + 1))
  }

  const clubId = args.get('club-id')
  const teamId = args.get('team-id')
  if (!file || !clubId || !teamId) {
    usage()
    process.exit(1)
  }

  return { file, clubId, teamId }
}

function asRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function asArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value
}

function pickString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableUrl(value) {
  const trimmed = nullableString(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

function nullableInt(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null
}

function parseDate(value, label) {
  const text = pickString(value)
  const date = new Date(text)
  if (!text || Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be an ISO date string`)
  }
  return date
}

function normalizeStatus(value) {
  const normalized = pickString(value, 'SCHEDULED').toUpperCase()
  const mapped =
    normalized === 'FINAL'
      ? 'FINISHED'
      : normalized === 'POSTPONED'
        ? 'POSTPONED'
        : normalized
  return VALID_STATUS.has(mapped) ? mapped : 'UNKNOWN'
}

function normalizeConfidence(value) {
  const normalized = pickString(value, 'OFFICIAL_PARTNER').toUpperCase()
  return VALID_CONFIDENCE.has(normalized) ? normalized : 'OFFICIAL_PARTNER'
}

function jsonValue(value) {
  return value == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(value))
}

function deriveSeason(kickoffAt) {
  const year = kickoffAt.getUTCFullYear()
  return kickoffAt.getUTCMonth() >= 6
    ? `${year}/${year + 1}`
    : `${year - 1}/${year}`
}

function makeExternalMatchId(fixture, index) {
  return (
    pickString(fixture.externalMatchId) ||
    pickString(fixture.id) ||
    [
      pickString(fixture.competition, 'fixture'),
      pickString(fixture.homeTeam, 'home'),
      pickString(fixture.awayTeam, 'away'),
      pickString(fixture.kickoffAt, String(index)),
    ]
      .join('|')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  )
}

function sharedProviderKey(provider) {
  return String(provider).toLowerCase()
}

function eventKey(provider, externalMatchId) {
  return `${provider}:${externalMatchId}`
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inferOpponent(linkLabel, homeTeam, awayTeam) {
  const linked = normalizeName(linkLabel)
  const home = normalizeName(homeTeam)
  const away = normalizeName(awayTeam)
  if (linked && home.includes(linked)) return { isHome: true, opponent: awayTeam }
  if (linked && away.includes(linked)) return { isHome: false, opponent: homeTeam }
  return { isHome: null, opponent: awayTeam }
}

async function syncEventForFixture(prisma, fixture, linkLabel) {
  const creator = await prisma.membership.findFirst({
    where: {
      clubId: fixture.clubId,
      role: { in: ['OWNER', 'ADMIN', 'COACH'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })
  if (!creator) return

  const perspective = inferOpponent(linkLabel, fixture.homeTeam, fixture.awayTeam)
  const title =
    perspective.isHome === false
      ? `Auswaerts bei ${perspective.opponent}`
      : `Spiel gegen ${perspective.opponent}`
  const location = [fixture.venueName, fixture.pitchAddress].filter(Boolean).join(' · ') || null
  const key = eventKey(fixture.provider, fixture.externalMatchId)
  const notes = [
    `Competition: ${fixture.competition}`,
    `Status: ${sharedProviderKey(fixture.status)}`,
    fixture.resultHome !== null && fixture.resultAway !== null
      ? `Result: ${fixture.resultHome}:${fixture.resultAway}`
      : null,
    'Imported from licensed fixture feed',
  ].filter(Boolean).join('\n')

  await prisma.event.upsert({
    where: { externalMatchKey: key },
    update: {
      title,
      date: fixture.kickoffAt,
      location,
      notes,
    },
    create: {
      clubId: fixture.clubId,
      teamId: fixture.teamId,
      externalMatchKey: key,
      title,
      type: 'MATCH',
      date: fixture.kickoffAt,
      location,
      notes,
      createdById: creator.userId,
    },
  })
}

function normalizeFixture(fixture, index, context) {
  const kickoffAt = parseDate(fixture.kickoffAt, `fixtures[${index}].kickoffAt`)
  const homeTeam = pickString(fixture.homeTeam)
  const awayTeam = pickString(fixture.awayTeam)
  if (!homeTeam || !awayTeam) {
    throw new Error(`fixtures[${index}] must include homeTeam and awayTeam`)
  }

  const externalMatchId = makeExternalMatchId(fixture, index)
  const competition = pickString(fixture.competition, context.defaultCompetition)
  return {
    clubId: context.clubId,
    teamId: context.teamId,
    teamLinkId: context.teamLinkId,
    provider: 'LICENSED_FEED',
    externalMatchId,
    competition,
    season: nullableString(fixture.season) ?? deriveSeason(kickoffAt),
    kickoffAt,
    status: normalizeStatus(fixture.status),
    homeTeam,
    awayTeam,
    homeLogo: nullableUrl(fixture.homeLogo),
    awayLogo: nullableUrl(fixture.awayLogo),
    venueName: nullableString(fixture.venueName),
    pitchAddress: nullableString(fixture.pitchAddress),
    resultHome: nullableInt(fixture.resultHome),
    resultAway: nullableInt(fixture.resultAway),
    tableSnapshot: Array.isArray(fixture.tableSnapshot) ? fixture.tableSnapshot : null,
    sourceConfidence: normalizeConfidence(fixture.sourceConfidence),
    rawPayload: {
      licensedFeed: fixture,
      importedBy: 'fixture-feed:import',
      sourceName: context.sourceName,
      importedAt: new Date().toISOString(),
    },
  }
}

async function main() {
  const { file, clubId, teamId } = parseArgs(process.argv.slice(2))
  const feed = asRecord(JSON.parse(await readFile(file, 'utf8')), 'feed')
  const team = asRecord(feed.team ?? {}, 'feed.team')
  const fixtures = asArray(feed.fixtures, 'feed.fixtures')

  const prisma = new PrismaClient()
  let imported = 0
  let updated = 0
  let skipped = 0
  let linkId = null
  let syncRunId = null

  try {
    const teamRow = await prisma.team.findFirst({
      where: { id: teamId, clubId },
      select: { id: true, name: true, displayName: true, clubId: true },
    })
    if (!teamRow) {
      throw new Error('Team not found for provided --club-id and --team-id')
    }

    const sourceName = pickString(feed.sourceName, 'Licensed fixture feed')
    const externalTeamId =
      pickString(team.externalTeamId) ||
      pickString(feed.externalTeamId) ||
      `licensed-feed:${teamId}`
    const label =
      pickString(team.label) ||
      pickString(feed.label) ||
      teamRow.displayName ||
      teamRow.name
    const externalUrl =
      nullableUrl(team.externalUrl) ||
      nullableUrl(feed.externalUrl) ||
      `https://anstoss.local/licensed-feed/${externalTeamId}`

    const link = await prisma.externalTeamLink.upsert({
      where: {
        teamId_provider_externalTeamId: {
          teamId,
          provider: 'LICENSED_FEED',
          externalTeamId,
        },
      },
      create: {
        clubId,
        teamId,
        provider: 'LICENSED_FEED',
        externalTeamId,
        externalClubId: nullableString(team.externalClubId ?? feed.externalClubId),
        externalUrl,
        label,
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
      },
      update: {
        externalClubId: nullableString(team.externalClubId ?? feed.externalClubId),
        externalUrl,
        label,
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
      },
    })
    linkId = link.id

    const syncRun = await prisma.syncRun.create({
      data: {
        clubId,
        teamLinkId: link.id,
        provider: 'LICENSED_FEED',
        status: 'PARTIAL',
        parserVersion: '2026-06-21.licensed-feed-v1',
      },
    })
    syncRunId = syncRun.id

    for (let i = 0; i < fixtures.length; i += 1) {
      const fixture = normalizeFixture(asRecord(fixtures[i], `fixtures[${i}]`), i, {
        clubId,
        teamId,
        teamLinkId: link.id,
        defaultCompetition: pickString(feed.competition, 'League fixture'),
        sourceName,
      })

      const existing = await prisma.importedFixture.findUnique({
        where: {
          teamLinkId_externalMatchId: {
            teamLinkId: link.id,
            externalMatchId: fixture.externalMatchId,
          },
        },
        select: { id: true },
      })

      const saved = await prisma.importedFixture.upsert({
        where: {
          teamLinkId_externalMatchId: {
            teamLinkId: link.id,
            externalMatchId: fixture.externalMatchId,
          },
        },
        update: {
          competition: fixture.competition,
          season: fixture.season,
          kickoffAt: fixture.kickoffAt,
          status: fixture.status,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          homeLogo: fixture.homeLogo,
          awayLogo: fixture.awayLogo,
          venueName: fixture.venueName,
          pitchAddress: fixture.pitchAddress,
          resultHome: fixture.resultHome,
          resultAway: fixture.resultAway,
          tableSnapshot: jsonValue(fixture.tableSnapshot),
          rawPayload: jsonValue(fixture.rawPayload),
          sourceConfidence: fixture.sourceConfidence,
          lastSeenAt: new Date(),
        },
        create: {
          ...fixture,
          tableSnapshot: jsonValue(fixture.tableSnapshot),
          rawPayload: jsonValue(fixture.rawPayload),
          lastSeenAt: new Date(),
        },
      })

      if (existing) updated += 1
      else imported += 1

      await syncEventForFixture(prisma, saved, label)
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: imported > 0 || updated > 0 ? 'SUCCESS' : 'PARTIAL',
        importedCount: imported,
        updatedCount: updated,
        skippedCount: skipped,
        completedAt: new Date(),
      },
    })
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : 'Unknown import failure'
    if (linkId) {
      await prisma.externalTeamLink.update({
        where: { id: linkId },
        data: { status: 'ERROR' },
      }).catch(() => undefined)
    }
    if (syncRunId) {
      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: 'FAILED',
          errorSummary,
          completedAt: new Date(),
          importedCount: imported,
          updatedCount: updated,
          skippedCount: skipped,
        },
      }).catch(() => undefined)
    }
    console.error(error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }

  if (process.exitCode !== 1) {
    console.log(
      `Imported ${imported} licensed fixtures (${updated} updated, ${skipped} skipped).`,
    )
  }
}

main()
