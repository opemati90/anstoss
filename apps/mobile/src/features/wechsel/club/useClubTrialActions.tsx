import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubTrialActionInput, TrialInvite } from '@anstoss/shared'
import { Haptics } from '../../../utils/haptics'
import { paths, wechselApi, type TeamOption } from '../api'
import type { TrialCardAction } from '../components/Cards'
import {
  apiErrorMessage,
  confirmAction,
  DecisionSheet,
  FeedbackSheet,
  InviteSheet,
} from '../components/Sheets'
import { invalidateApi } from '../query'

/**
 * Club-side pipeline steps with their sheets. Shared by the Wechselbörse
 * list and the trial detail so both behave identically.
 */
export function useClubTrialActions(clubId: string | null, teams: TeamOption[]) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<TrialInvite | null>(null)
  const [sheet, setSheet] = useState<'invite' | 'feedback' | 'offer' | 'reject' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const close = useCallback(() => setSheet(null), [])

  const send = useCallback(
    async (invite: TrialInvite, body: ClubTrialActionInput, success?: string) => {
      if (!clubId) return
      setBusyId(invite.id)
      try {
        await wechselApi.clubAction(clubId, invite.id, body)
        invalidateApi(paths.clubTrials(clubId), paths.trial(invite.id), paths.clubSearches(clubId))
        Haptics.success()
        setSheet(null)
        if (success) Alert.alert(success)
      } catch (error) {
        Alert.alert(t('common.error'), apiErrorMessage(t, error))
      } finally {
        setBusyId(null)
      }
    },
    [clubId, t],
  )

  const run = useCallback(
    (invite: TrialInvite, action: TrialCardAction) => {
      setTarget(invite)
      if (action === 'revoke') {
        confirmAction(
          t('wechsel.revokeTitle'),
          t('wechsel.revokeBody', { name: invite.player.name }),
          t('wechsel.actionRevoke'),
          t('common.cancel'),
          () => void send(invite, { action: 'revoke' }),
        )
        return
      }
      setSheet(action)
    },
    [send, t],
  )

  const teamsForInvite =
    target && teams.some((team) => team.id === target.teamId)
      ? teams
      : target
        ? [{ id: target.teamId, displayName: target.team.displayName, leagueName: null }]
        : teams

  const sheets = clubId ? (
    <>
      <InviteSheet
        visible={sheet === 'invite'}
        onClose={close}
        clubId={clubId}
        teams={teamsForInvite}
        playerName={target?.player.name ?? ''}
        initialTeamId={target?.teamId}
        lockTeam
        submitting={Boolean(target && busyId === target.id)}
        onSubmit={({ sessionEventIds, message }) =>
          target &&
          void send(
            target,
            { action: 'invite', sessionEventIds, message },
            t('wechsel.inviteSent', { name: target.player.name }),
          )
        }
      />
      <FeedbackSheet
        visible={sheet === 'feedback'}
        onClose={close}
        invite={target}
        submitting={Boolean(target && busyId === target.id)}
        onSubmit={(input) => target && void send(target, { action: 'feedback', ...input })}
      />
      <DecisionSheet
        visible={sheet === 'offer' || sheet === 'reject'}
        mode={sheet === 'reject' ? 'reject' : 'offer'}
        onClose={close}
        invite={target}
        submitting={Boolean(target && busyId === target.id)}
        onSubmit={(message) =>
          target &&
          void send(
            target,
            sheet === 'reject' ? { action: 'reject', message } : { action: 'offer', message },
            sheet === 'reject'
              ? t('wechsel.rejectSent', { name: target.player.name })
              : t('wechsel.offerSent', { name: target.player.name }),
          )
        }
      />
    </>
  ) : null

  return { run, sheets, busyId }
}
