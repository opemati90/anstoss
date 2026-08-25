import { useCallback, useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Button, Icon, Text } from '../../src/components/ui'
import { FormInput } from '../../src/components/FormInput'
import { radius, space } from '../../src/theme/tokens'

type Claim = {
  id: string
  status: 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
  reviewNote?: string | null
  directoryEntry: { name: string; city?: string | null; badgeUrl?: string | null }
}

export default function ClaimPendingScreen() {
  const { t } = useTranslation()
  const colors = useClubColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ claimId?: string }>()
  const { refreshUser } = useAuth()
  const [checking, setChecking] = useState(false)
  const [claim, setClaim] = useState<Claim | null>(null)
  const [response, setResponse] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const claimId = params.claimId
  const checkStatus = useCallback(
    async (notify = true) => {
      setChecking(true)
      try {
        const claims = await api<Claim[]>('/club-claims/mine')
        const claim = claims.find((item) => item.id === claimId) ?? claims[0]
        if (!claim) {
          Alert.alert(t('common.error'), t('claimPending.missing'))
          return
        }
        setClaim(claim)
        if (claim.status === 'APPROVED') {
          await refreshUser(undefined, { throwOnError: true })
          router.replace('/')
          return
        }
        if (claim.status === 'NEEDS_INFO') {
          return
        }
        if (claim.status === 'REJECTED' || claim.status === 'EXPIRED') {
          Alert.alert(
            t('claimPending.rejectedTitle'),
            claim.reviewNote || t('claimPending.rejectedBody'),
          )
          return
        }
        if (notify) Alert.alert(t('claimPending.reviewingTitle'), t('claimPending.reviewingBody'))
      } catch (error) {
        Alert.alert(
          t('common.error'),
          error instanceof Error ? error.message : t('claimPending.checkFailed'),
        )
      } finally {
        setChecking(false)
      }
    },
    [claimId, refreshUser, router, t],
  )

  useEffect(() => {
    void checkStatus(false)
  }, [checkStatus])

  async function submitResponse() {
    if (!claim || response.trim().length < 2 || submitting) return
    setSubmitting(true)
    try {
      await api(`/club-claims/${encodeURIComponent(claim.id)}/respond`, {
        method: 'POST',
        body: { note: response.trim() },
      })
      setResponse('')
      setClaim({ ...claim, status: 'SUBMITTED' })
      Alert.alert(t('claimPending.responseSentTitle'), t('claimPending.responseSentBody'))
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('claimPending.responseFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function withdrawClaim() {
    if (!claim || withdrawing) return
    setWithdrawing(true)
    try {
      await api(`/club-claims/${encodeURIComponent(claim.id)}/withdraw`, { method: 'POST' })
      setClaim({ ...claim, status: 'WITHDRAWN' })
      router.replace('/find-club')
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('claimPending.withdrawFailed'),
      )
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primary50 }]}>
          <Icon name="checkmark.shield.fill" size={34} color="primary" />
        </View>
        <Text variant="title1" weight="bold" align="center">
          {t('claimPending.title')}
        </Text>
        <Text variant="body" color="secondary" align="center" style={styles.copy}>
          {t('claimPending.body')}
        </Text>
        <View
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text variant="footnote" weight="semibold">
            {t('claimPending.nextTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('claimPending.step1')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('claimPending.step2')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('claimPending.step3')}
          </Text>
        </View>
        {claim?.status === 'NEEDS_INFO' ? (
          <View style={styles.responseSection}>
            <View style={[styles.notice, { backgroundColor: colors.primary50 }]}>
              <Text variant="subheadline" weight="semibold">
                {t('claimPending.needsInfoTitle')}
              </Text>
              <Text variant="footnote" color="secondary">
                {claim.reviewNote || t('claimPending.needsInfoBody')}
              </Text>
            </View>
            <FormInput
              label={t('claimPending.responseLabel')}
              value={response}
              onChangeText={setResponse}
              placeholder={t('claimPending.responsePlaceholder')}
              multiline
              numberOfLines={4}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Button
              label={t('claimPending.sendResponse')}
              onPress={submitResponse}
              disabled={response.trim().length < 2}
              loading={submitting}
              fullWidth
            />
          </View>
        ) : null}
        <Button
          label={t('claimPending.check')}
          onPress={() => void checkStatus()}
          loading={checking}
          fullWidth
        />
        {claim?.status === 'SUBMITTED' || claim?.status === 'NEEDS_INFO' ? (
          <Button
            label={t('claimPending.withdraw')}
            onPress={withdrawClaim}
            loading={withdrawing}
            variant="bordered"
            fullWidth
          />
        ) : null}
        {claim?.status === 'REJECTED' ||
        claim?.status === 'EXPIRED' ||
        claim?.status === 'WITHDRAWN' ? (
          <Button
            label={t('claimPending.startAgain')}
            onPress={() => router.replace('/find-club')}
            fullWidth
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    gap: space.lg,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { maxWidth: 420, alignSelf: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  responseSection: { gap: space.md },
  notice: { borderRadius: radius.md, padding: space.md, gap: space.xs },
})
