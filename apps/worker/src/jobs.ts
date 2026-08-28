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
]
