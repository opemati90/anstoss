import { useEffect, useRef, useState } from 'react'
import { Alert, Linking, Share } from 'react-native'
import { router } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { completeDeletedActorAttendanceCleanup } from '../components/events/coachAttendanceRecovery'

/** Shared by Profile and the age-blocked account's privacy-only route. */
export function useAccountPrivacyActions() {
  const { t } = useTranslation()
  const { user, activeClub, signOut } = useAuth()
  const mounted = useRef(true)
  const visit = useRef({ accountId: user?.id })
  if (visit.current.accountId !== user?.id) visit.current = { accountId: user?.id }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; visit.current = { accountId: undefined } }
  }, [])
  const deletionBusy = useRef(false)
  const exportBusy = useRef(false)
  const deletionCommittedFor = useRef<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportData = async () => {
    const accountId = user?.id
    if (!accountId || exportBusy.current) return
    const currentVisit = visit.current
    const isCurrent = () => mounted.current && visit.current === currentVisit
    exportBusy.current = true
    setExporting(true)
    const openManualRequest = () => {
      if (!isCurrent()) return
      const subject = encodeURIComponent(t('profileHub.exportMailSubject'))
      const body = encodeURIComponent(t('profileHub.exportMailBody', {
        email: user?.email ?? '-', userId: accountId, club: activeClub?.club?.name ?? '-',
      }))
      void Linking.openURL(`mailto:support@anstoss.io?subject=${subject}&body=${body}`).catch(() =>
        Alert.alert(t('more.exportData'), t('more.exportFallback')))
    }
    let fileUri: string | null = null
    try {
      let payload: unknown
      try { payload = await api('/me/export-bound', { headers: { 'x-expected-actor-id': accountId } }) } catch (error) {
        if (!isCurrent()) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return
        if (error instanceof ApiError && error.status >= 500) Alert.alert(t('common.error'), t('more.exportError'))
        else openManualRequest()
        return
      }
      if (!isCurrent()) return
      const json = JSON.stringify(payload, null, 2)
      const canShareFile = FileSystem.cacheDirectory && await Sharing.isAvailableAsync()
      if (!isCurrent()) return
      if (canShareFile) {
        fileUri = `${FileSystem.cacheDirectory}anstoss-data-export-${Date.now()}.json`
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 })
        if (!isCurrent()) return
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: t('profileHub.exportDialogTitle') })
      } else if (json.length <= 20000) {
        await Share.share({ title: t('profileHub.exportDialogTitle'), message: json })
      } else openManualRequest()
    } catch { openManualRequest() }
    finally {
      // Delete only this export's temporary cache copy, never user-shared files.
      if (fileUri) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined)
      exportBusy.current = false
      if (mounted.current) setExporting(false)
    }
  }

  const handleDeleteAccount = () => {
    const currentVisit = visit.current
    const isCurrent = () => mounted.current && visit.current === currentVisit
    Alert.alert(t('more.deleteAccountTitle'), t('more.deleteAccountBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.deleteAccountConfirm'), style: 'destructive', onPress: async () => {
        const accountId = user?.id
        if (!accountId || !isCurrent() || deletionBusy.current) return
        deletionBusy.current = true
        try {
          if (deletionCommittedFor.current !== accountId) {
            await api('/me/bound', { method: 'DELETE', headers: { 'x-expected-actor-id': accountId } })
            deletionCommittedFor.current = accountId
          }
          await completeDeletedActorAttendanceCleanup(accountId)
          if (!isCurrent()) return
          await signOut()
          router.replace('/(auth)/welcome')
        } catch {
          if (!isCurrent()) return
          Alert.alert(t(deletionCommittedFor.current === accountId ? 'more.deleteAccountSuccess' : 'common.error'),
            t(deletionCommittedFor.current === accountId ? 'more.deleteAccountSignOutError' : 'more.deleteAccountError'))
        } finally { deletionBusy.current = false }
      } },
    ])
  }
  return { handleExportData, handleDeleteAccount, exporting }
}
