import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { FormInput } from '../src/components/FormInput'
import { ModalHeader } from '../src/components/ModalHeader'
import { BottomSheet, Button, ListRow, Screen, SectionGroup, Text } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { space } from '../src/theme/tokens'

type ContributionRecord = {
  id: string
  amount: number
  paidAmount: number | null
  currency: string
  member: { id: string; name: string }
}

type BankMatch = {
  id: string
  amount: number
  status: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED' | 'REVERSED'
  reversalReason?: string | null
  record: ContributionRecord
}

type BankTransaction = {
  id: string
  amount: number
  currency: string
  payerName: string | null
  reference: string | null
  bookedAt: string
  matches: BankMatch[]
}

type BankBatch = {
  id: string
  fileName: string
  format: 'CSV' | 'CAMT053'
  rowCount: number
  createdAt: string
  transactions: BankTransaction[]
}

type Suggestion = {
  transaction: BankTransaction
  record: ContributionRecord
  confidence: number
}

export default function AdminContributionReconciliationScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const entitlements = useEntitlements()
  const clubId = activeClub?.club.id
  const [batches, setBatches] = useState<BankBatch[]>([])
  const [activeBatch, setActiveBatch] = useState<BankBatch | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [outstandingRecords, setOutstandingRecords] = useState<ContributionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<BankMatch | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [manualTransaction, setManualTransaction] = useState<BankTransaction | null>(null)
  const [manualRecord, setManualRecord] = useState<ContributionRecord | null>(null)
  const [manualAmount, setManualAmount] = useState('')

  const loadBatch = useCallback(
    async (batchId: string) => {
      if (!clubId) return
      const [batch, candidates, records] = await Promise.all([
        api<BankBatch>(`/clubs/${clubId}/contributions/imports/${batchId}`),
        api<Suggestion[]>(`/clubs/${clubId}/contributions/imports/${batchId}/suggestions`),
        api<ContributionRecord[]>(`/clubs/${clubId}/contributions/imports/records/outstanding`),
      ])
      setActiveBatch(batch)
      setSuggestions(Array.isArray(candidates) ? candidates : [])
      setOutstandingRecords(Array.isArray(records) ? records : [])
    },
    [clubId],
  )

  const load = useCallback(async () => {
    if (!clubId) return
    setError(false)
    try {
      const rows = await api<BankBatch[]>(`/clubs/${clubId}/contributions/imports`)
      const safeRows = Array.isArray(rows) ? rows : []
      setBatches(safeRows)
      if (safeRows[0]) await loadBatch(safeRows[0].id)
      else {
        setActiveBatch(null)
        setSuggestions([])
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [clubId, loadBatch])

  useEffect(() => {
    void load()
  }, [load])

  const pickAndImport = async () => {
    if (!clubId) return
    const selected = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/xml', 'application/xml', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (selected.canceled) return
    const file = selected.assets[0]
    if (!file || (file.size ?? 0) > 10 * 1024 * 1024) {
      Alert.alert(
        t('contributions.reconciliation.fileTooLargeTitle'),
        t('contributions.reconciliation.fileTooLargeBody'),
      )
      return
    }
    const lower = file.name.toLowerCase()
    const format = lower.endsWith('.xml') ? 'CAMT053' : 'CSV'
    setBusy('import')
    try {
      const contentBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const batch = await api<BankBatch>(`/clubs/${clubId}/contributions/imports`, {
        method: 'POST',
        body: { fileName: file.name, format, contentBase64 },
      })
      await load()
      await loadBatch(batch.id)
    } catch (cause) {
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Import failed' }),
        cause instanceof Error ? cause.message : t('common.tryAgain'),
      )
    } finally {
      setBusy(null)
    }
  }

  const confirm = async (candidate: Suggestion) => {
    if (!clubId) return
    const outstanding = Math.max(0, candidate.record.amount - (candidate.record.paidAmount ?? 0))
    const amount = Math.min(candidate.transaction.amount, outstanding)
    if (amount <= 0) return
    setBusy(`confirm:${candidate.transaction.id}:${candidate.record.id}`)
    try {
      await api(`/clubs/${clubId}/contributions/imports/matches/confirm`, {
        method: 'POST',
        body: {
          transactionId: candidate.transaction.id,
          recordId: candidate.record.id,
          amount,
        },
      })
      if (activeBatch) await loadBatch(activeBatch.id)
    } catch (cause) {
      Alert.alert(t('common.error'), cause instanceof Error ? cause.message : t('common.tryAgain'))
    } finally {
      setBusy(null)
    }
  }

  const confirmManual = async () => {
    if (!clubId || !activeBatch || !manualTransaction || !manualRecord) return
    const amount = Math.round(Number(manualAmount.replace(',', '.')) * 100)
    const outstanding = Math.max(0, manualRecord.amount - (manualRecord.paidAmount ?? 0))
    if (!Number.isFinite(amount) || amount <= 0 || amount > manualTransaction.amount || amount > outstanding) {
      Alert.alert(t('common.errorTitle'), t('contributions.reconciliation.invalidAmount'))
      return
    }
    setBusy(`manual:${manualTransaction.id}`)
    try {
      await api(`/clubs/${clubId}/contributions/imports/matches/confirm`, {
        method: 'POST',
        body: { transactionId: manualTransaction.id, recordId: manualRecord.id, amount },
      })
      setManualTransaction(null)
      setManualRecord(null)
      setManualAmount('')
      await loadBatch(activeBatch.id)
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.tryAgain'))
    } finally {
      setBusy(null)
    }
  }

  const reverse = (match: BankMatch) => {
    setReverseTarget(match)
    setReversalReason('')
  }

  const confirmReverse = async () => {
    if (!clubId || !activeBatch || !reverseTarget || reversalReason.trim().length < 3) return
    setBusy(`reverse:${reverseTarget.id}`)
    try {
      await api(`/clubs/${clubId}/contributions/imports/matches/${reverseTarget.id}/reverse`, {
        method: 'POST',
        body: { reason: reversalReason.trim() },
      })
      setReverseTarget(null)
      setReversalReason('')
      await loadBatch(activeBatch.id)
    } catch (cause) {
      Alert.alert(
        t('common.error'),
        cause instanceof Error ? cause.message : t('common.tryAgain'),
      )
    } finally {
      setBusy(null)
    }
  }

  const confirmed =
    activeBatch?.transactions.flatMap((transaction) =>
      transaction.matches.filter((match) => match.status === 'CONFIRMED'),
    ) ?? []
  const unmatchedTransactions =
    activeBatch?.transactions.filter(
      (transaction) => !transaction.matches.some((match) => match.status === 'CONFIRMED'),
    ) ?? []

  if (entitlements.loading || (!entitlements.data && !entitlements.error)) {
    return (
      <Screen header={<ModalHeader title={t('contributions.reconciliation.title')} mode="back" />} contentStyle={styles.content}>
        <ActivityIndicator color={c.primary} style={styles.loader} />
      </Screen>
    )
  }

  if (entitlements.error && !entitlements.data) {
    return (
      <Screen header={<ModalHeader title={t('contributions.reconciliation.title')} mode="back" />} contentStyle={styles.content}>
        <EmptyState
          icon="wifi.exclamationmark"
          title={t('contributions.reconciliation.accessErrorTitle')}
          description={t('contributions.reconciliation.accessErrorBody')}
          actionLabel={t('common.tryAgain')}
          onAction={() => void entitlements.refresh()}
        />
      </Screen>
    )
  }

  if (!entitlements.has('bank_reconciliation')) {
    return (
      <Screen
        header={<ModalHeader title={t('contributions.reconciliation.title')} mode="back" />}
        scroll
        contentStyle={styles.content}
      >
        <EmptyState
          icon="lock.fill"
          title={t('contributions.reconciliation.proTitle')}
          description={t('contributions.reconciliation.proBody')}
          actionLabel={t('contributions.reconciliation.viewPlans')}
          onAction={() => router.push('/admin-billing')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('contributions.reconciliation.title')} mode="back" />}
      scroll
      padded={false}
      contentStyle={styles.content}
      style={{ backgroundColor: c.surfaceSunken }}
    >
      <View style={styles.intro}>
        <Text variant="title2" color="primary">{t('contributions.reconciliation.introTitle')}</Text>
        <Text variant="body" color="secondary">
          {t('contributions.reconciliation.introBody')}
        </Text>
        <Button
          label={busy === 'import' ? t('contributions.reconciliation.importing') : t('contributions.reconciliation.importAction')}
          onPress={() => void pickAndImport()}
          loading={busy === 'import'}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={c.primary} style={styles.loader} />
      ) : error ? (
        <EmptyState
          icon="exclamationmark.triangle"
          title={t('contributions.reconciliation.loadErrorTitle')}
          description={t('contributions.reconciliation.loadErrorBody')}
          actionLabel={t('common.tryAgain')}
          onAction={() => void load()}
        />
      ) : batches.length === 0 ? (
        <EmptyState
          icon="doc.text"
          title={t('contributions.reconciliation.emptyTitle')}
          description={t('contributions.reconciliation.emptyBody')}
        />
      ) : (
        <>
          <SectionGroup header={t('contributions.reconciliation.recentImports')} style={styles.section}>
            {batches.map((batch) => (
              <ListRow
                key={batch.id}
                title={batch.fileName}
                subtitle={`${t('contributions.reconciliation.transactionCount', { count: batch.rowCount })} · ${new Intl.DateTimeFormat(i18n.language).format(new Date(batch.createdAt))}`}
                selected={activeBatch?.id === batch.id}
                onPress={() => void loadBatch(batch.id)}
              />
            ))}
          </SectionGroup>

          {unmatchedTransactions.length > 0 ? (
            <SectionGroup
              header={t('contributions.reconciliation.manualTitle')}
              footer={t('contributions.reconciliation.manualFooter')}
              style={styles.section}
            >
              {unmatchedTransactions.map((transaction) => (
                <ListRow
                  key={transaction.id}
                  title={transaction.payerName ?? t('contributions.reconciliation.unknownPayer')}
                  subtitle={`${formatCurrency(transaction.amount, transaction.currency, i18n.language)} · ${transaction.reference ?? t('contributions.reconciliation.noReference')}`}
                  right={<Button label={t('contributions.reconciliation.match')} size="sm" variant="bordered" onPress={() => {
                    setManualTransaction(transaction)
                    setManualRecord(null)
                    setManualAmount((transaction.amount / 100).toFixed(2))
                  }} />}
                />
              ))}
            </SectionGroup>
          ) : null}

          <SectionGroup
            header={t('contributions.reconciliation.suggestionsTitle')}
            footer={t('contributions.reconciliation.suggestionsFooter')}
            style={styles.section}
          >
            {suggestions.length === 0 ? (
              <ListRow title={t('contributions.reconciliation.noSuggestionsTitle')} subtitle={t('contributions.reconciliation.noSuggestionsBody')} />
            ) : (
              suggestions.map((candidate) => {
                const key = `${candidate.transaction.id}:${candidate.record.id}`
                return (
                  <ListRow
                    key={key}
                    title={`${candidate.transaction.payerName ?? t('contributions.reconciliation.unknownPayer')} → ${candidate.record.member.name}`}
                    subtitle={`${formatCurrency(candidate.transaction.amount, candidate.transaction.currency, i18n.language)} · ${t('contributions.reconciliation.confidence', { value: candidate.confidence })}`}
                    right={
                      <Button
                        label={t('contributions.reconciliation.confirm')}
                        size="sm"
                        onPress={() => void confirm(candidate)}
                        loading={busy === `confirm:${key}`}
                      />
                    }
                  />
                )
              })
            )}
          </SectionGroup>

          {confirmed.length > 0 ? (
            <SectionGroup header={t('contributions.reconciliation.confirmedTitle')} style={styles.section}>
              {confirmed.map((match) => (
                <ListRow
                  key={match.id}
                  title={match.record.member.name}
                  subtitle={formatCurrency(match.amount, match.record.currency, i18n.language)}
                  right={
                    <Button
                      label={t('contributions.reconciliation.reverse')}
                      variant="bordered"
                      size="sm"
                      onPress={() => reverse(match)}
                      loading={busy === `reverse:${match.id}`}
                    />
                  }
                />
              ))}
            </SectionGroup>
          ) : null}
        </>
      )}
      <BottomSheet
        visible={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        heightPct="auto"
      >
        <View style={styles.sheet}>
          <Text variant="title2">{t('contributions.reconciliation.reverseTitle')}</Text>
          <Text variant="body" color="secondary">
            {t('contributions.reconciliation.reverseBody')}
          </Text>
          <FormInput
            label={t('contributions.reconciliation.reason')}
            value={reversalReason}
            onChangeText={setReversalReason}
            placeholder={t('contributions.reconciliation.reasonPlaceholder')}
            multiline
          />
          <Button
            label={t('contributions.reconciliation.reverseAction')}
            onPress={() => void confirmReverse()}
            disabled={reversalReason.trim().length < 3}
            loading={Boolean(reverseTarget && busy === `reverse:${reverseTarget.id}`)}
          />
          <Button label={t('common.cancel')} variant="bordered" onPress={() => setReverseTarget(null)} />
        </View>
      </BottomSheet>
      <BottomSheet
        visible={Boolean(manualTransaction)}
        onClose={() => setManualTransaction(null)}
        heightPct="auto"
      >
        <View style={styles.sheet}>
          <Text variant="title2">{t('contributions.reconciliation.manualSheetTitle')}</Text>
          <Text variant="body" color="secondary">
            {t('contributions.reconciliation.manualSheetBody')}
          </Text>
          <ScrollView
            style={styles.recordList}
            contentContainerStyle={styles.recordListContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('contributions.reconciliation.outstandingListLabel')}
          >
            {outstandingRecords.map((record) => (
              <ListRow
                key={record.id}
                title={record.member.name}
                subtitle={formatCurrency(
                  Math.max(0, record.amount - (record.paidAmount ?? 0)),
                  record.currency,
                  i18n.language,
                )}
                selected={manualRecord?.id === record.id}
                onPress={() => setManualRecord(record)}
              />
            ))}
          </ScrollView>
          <FormInput
            label={t('contributions.reconciliation.amount')}
            value={manualAmount}
            onChangeText={setManualAmount}
            keyboardType="decimal-pad"
          />
          <Button
            label={t('contributions.reconciliation.confirmAllocation')}
            onPress={() => void confirmManual()}
            disabled={!manualRecord || !manualAmount}
            loading={Boolean(manualTransaction && busy === `manual:${manualTransaction.id}`)}
          />
          <Button label={t('common.cancel')} variant="bordered" onPress={() => setManualTransaction(null)} />
        </View>
      </BottomSheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.lg, paddingBottom: space['3xl'] },
  intro: { gap: space.sm },
  loader: { marginTop: space.xl },
  section: { marginHorizontal: 0 },
  sheet: { gap: space.md },
  recordList: { maxHeight: 280 },
  recordListContent: { paddingBottom: space.xs },
})

function formatCurrency(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}
