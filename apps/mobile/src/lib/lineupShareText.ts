import {
  FORMATIONS,
  type SquadPlayer,
} from './lineupFairness'

export type LineupShareInput = {
  /** Display title — usually "{home} vs {away}" or the fixture title. */
  fixtureTitle?: string | null
  /** Date of the match — formatted client-side before passing in. */
  whenLabel?: string | null
  formation: keyof typeof FORMATIONS | string
  /** Slot id → user id assignments. */
  xi: Record<string, string>
  /** Bench user ids in user-chosen order. */
  bench: string[]
  /** Full squad lookup so we can resolve names + positions + numbers. */
  squad: SquadPlayer[]
  /** Optional sender note. */
  note?: string | null
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, ' ')
}

/**
 * Pure formatter for the share-sheet text. Stable + deterministic so it
 * also works as a copy-to-clipboard payload. No i18n inside — the
 * caller passes already-localized labels via the `labels` param if it
 * needs translated headers; otherwise the English defaults are fine for
 * universal share targets (WhatsApp, iMessage, mail).
 */
export function buildLineupShareText(
  input: LineupShareInput,
  labels: {
    title: string
    formation: string
    startingXi: string
    bench: string
    sentFrom: string
  } = {
    title: 'Lineup',
    formation: 'Formation',
    startingXi: 'Starting XI',
    bench: 'Bench',
    sentFrom: 'Sent from Anstoss',
  },
): string {
  const slots = FORMATIONS[input.formation] ?? []
  const byId = new Map(input.squad.map((p) => [p.userId, p]))

  const header = [
    `⚽ ${input.fixtureTitle ?? labels.title}`,
    input.whenLabel ? input.whenLabel : null,
    `${labels.formation}: ${input.formation}`,
  ]
    .filter(Boolean)
    .join('\n')

  const xiLines: string[] = []
  for (const slot of slots) {
    const userId = input.xi[slot.id]
    const player = userId ? byId.get(userId) : null
    if (!player) continue
    const num =
      player.jerseyNumber != null ? pad(player.jerseyNumber) : '··'
    xiLines.push(`${num}  ${player.name} (${slot.id})`)
  }

  const benchLines: string[] = []
  for (const userId of input.bench) {
    const player = byId.get(userId)
    if (!player) continue
    const num =
      player.jerseyNumber != null ? pad(player.jerseyNumber) : '··'
    benchLines.push(`${num}  ${player.name}`)
  }

  const segments: string[] = [header]

  if (xiLines.length > 0) {
    segments.push(`\n${labels.startingXi}\n${xiLines.join('\n')}`)
  }

  if (benchLines.length > 0) {
    segments.push(`\n${labels.bench}\n${benchLines.join('\n')}`)
  }

  if (input.note?.trim()) {
    segments.push(`\n"${input.note.trim()}"`)
  }

  segments.push(`\n— ${labels.sentFrom}`)

  return segments.join('\n').trim()
}
