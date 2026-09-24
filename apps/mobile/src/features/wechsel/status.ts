import { TrialInviteStatus } from '@anstoss/shared'

/** A trial thread still open between club and player (mirrors the API). */
export const OPEN_STATUSES: TrialInviteStatus[] = [
  TrialInviteStatus.REQUESTED,
  TrialInviteStatus.PENDING,
  TrialInviteStatus.ACCEPTED,
  TrialInviteStatus.OFFERED,
]
