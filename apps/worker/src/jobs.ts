import { PUSH } from '@anstoss/shared'

export interface WorkerJobDefinition {
  id: string
  summary: string
  cadence: string
}

export const workerJobs: WorkerJobDefinition[] = [
  {
    id: 'invite-expiry-cleanup',
    summary: 'Sweep expired invites and flag clubs for invite regeneration.',
    cadence: 'hourly',
  },
  {
    id: 'rsvp-reminder-sweep',
    summary: 'Prepare RSVP reminder work for events nearing kickoff.',
    cadence: 'hourly',
  },
  {
    id: 'push-batch-flush',
    summary: `Flush queued chat push batches every ${PUSH.CHAT_BATCH_WINDOW_MS / 60000} minutes.`,
    cadence: 'every-5-minutes',
  },
  {
    id: 'billing-retry-loop',
    summary: 'Retry failed billing and webhook reconciliation jobs.',
    cadence: 'hourly',
  },
  {
    id: 'fussball-sync-sweep',
    summary:
      'Refresh linked FUSSBALL.DE team feeds every 6 hours and flag stale links for admin review.',
    cadence: 'every-6-hours',
  },
  {
    id: 'fussball-matchday-pulse',
    summary:
      'Increase sync cadence around kickoff windows to catch kickoff, venue, and result changes.',
    cadence: 'every-15-minutes',
  },
]
