/** Sharing is a handoff to another app, not evidence of a published post. */
export type StudioShareOutcome = 'share-sheet-opened' | 'cancelled' | 'discarded'

export class StudioExportError extends Error {
  constructor(readonly reason: 'capture-failed' | 'sharing-unavailable' | 'share-failed') {
    super(reason)
    this.name = 'StudioExportError'
  }
}

export type StudioShareDependencies = {
  /** Must become false after account, club, team, match or consent changes. */
  isCurrent: () => boolean
  capture: () => Promise<string | null>
  available: () => Promise<boolean>
  /** Adapter resolves cancelled for user cancellation, opened otherwise. */
  share: (uri: string) => Promise<'opened' | 'cancelled'>
  release: (uri: string) => void | Promise<void>
}

/**
 * Intentionally does not archive or post: those need independent confirmed
 * server outcomes. A missing image never becomes a silent caption-only share.
 * Called by the editor after its context/consent snapshot is ready.
 */
export async function shareStudioGraphic(
  deps: StudioShareDependencies,
): Promise<StudioShareOutcome> {
  if (!deps.isCurrent()) return 'discarded'
  let uri: string | null
  try {
    uri = await deps.capture()
  } catch {
    if (!deps.isCurrent()) return 'discarded'
    throw new StudioExportError('capture-failed')
  }
  if (!uri) {
    if (!deps.isCurrent()) return 'discarded'
    throw new StudioExportError('capture-failed')
  }
  try {
    if (!deps.isCurrent()) return 'discarded'
    const available = await deps.available().catch(() => false)
    if (!deps.isCurrent()) return 'discarded'
    if (!available) throw new StudioExportError('sharing-unavailable')
    try {
      const outcome = await deps.share(uri)
      if (!deps.isCurrent()) return 'discarded'
      return outcome === 'cancelled' ? 'cancelled' : 'share-sheet-opened'
    } catch (error) {
      if (!deps.isCurrent()) return 'discarded'
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
        return 'cancelled'
      throw new StudioExportError('share-failed')
    }
  } finally {
    // Release the captured temporary image on every path; never mask the outcome.
    try {
      await deps.release(uri)
    } catch {
      /* OS temporary-file cleanup remains a fallback. */
    }
  }
}
