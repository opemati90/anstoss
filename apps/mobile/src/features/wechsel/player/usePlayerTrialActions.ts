import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TrialInvite } from '@anstoss/shared'
import { useAuth } from '../../../context/AuthContext'
import { Haptics } from '../../../utils/haptics'
import { paths, wechselApi } from '../api'
import { apiErrorMessage, confirmAction } from '../components/Sheets'
import { invalidateApi } from '../query'
import type { PlayerTrialAction } from './PlayerTrialCard'

/** Player answers in the trial pipeline, with confirmations where it matters. */
export function usePlayerTrialActions() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const [busyId, setBusyId] = useState<string | null>(null)

  const send = useCallback(
    async (invite: TrialInvite, status: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN') => {
      setBusyId(invite.id)
      try {
        await wechselApi.playerAction(invite.id, status)
        invalidateApi(paths.myTrials, paths.trial(invite.id), '/player-searches')
        if (status === 'ACCEPTED') {
          Haptics.success()
          // Trial access to the team's sessions arrives with /me.
          void refreshUser().catch(() => undefined)
          Alert.alert(
            t('probetraining.acceptedTitle'),
            t('probetraining.acceptedBody', { club: invite.club.name }),
          )
        }
      } catch (error) {
        Alert.alert(t('common.error'), apiErrorMessage(t, error))
      } finally {
        setBusyId(null)
      }
    },
    [refreshUser, t],
  )

  const run = useCallback(
    (invite: TrialInvite, action: PlayerTrialAction) => {
      if (action === 'ACCEPTED') {
        void send(invite, 'ACCEPTED')
        return
      }
      if (action === 'WITHDRAWN') {
        confirmAction(
          t('probetraining.withdrawTitle'),
          t('probetraining.withdrawBody', { club: invite.club.name }),
          t('probetraining.withdraw'),
          t('common.cancel'),
          () => void send(invite, 'WITHDRAWN'),
        )
        return
      }
      confirmAction(
        action === 'DECLINE_OFFER' ? t('probetraining.declineOfferTitle') : t('probetraining.declineTitle'),
        t('probetraining.declineBody', { club: invite.club.name }),
        action === 'DECLINE_OFFER' ? t('probetraining.declineOffer') : t('probetraining.decline'),
        t('common.cancel'),
        () => void send(invite, 'DECLINED'),
      )
    },
    [send, t],
  )

  return { run, busyId }
}
