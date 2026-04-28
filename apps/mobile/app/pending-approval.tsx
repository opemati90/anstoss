import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { radius, space } from '../src/theme/tokens'

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut, refreshUser, pendingJoinRequest } = useAuth()
  const c = useClubColors()
  const [remindStatus, setRemindStatus] =
    useState<'idle' | 'sent' | 'cooldown' | 'error'>('idle')
  const [remindLoading, setRemindLoading] = useState(false)

  const isAgeGate =
    !!ageGate && (ageGate as { status?: string }).status === 'PENDING_PARENT_APPROVAL'

  const handleSignOut = () => {
    void signOut()
    router.replace('/(auth)/welcome')
  }

  const handleRemind = async () => {
    if (!pendingJoinRequest) return
    setRemindLoading(true)
    setRemindStatus('idle')
    try {
      await api(
        `/clubs/${pendingJoinRequest.clubId}/join-requests/${pendingJoinRequest.id}/remind`,
        { method: 'POST' },
      )
      setRemindStatus('sent')
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setRemindStatus('cooldown')
      } else {
        setRemindStatus('error')
      }
    } finally {
      setRemindLoading(false)
    }
  }

  const bodyText = isAgeGate
    ? t('pendingApproval.ageGateBody', {
        email: (ageGate as { guardianEmail?: string })?.guardianEmail ?? '',
      })
    : t('pendingApproval.body')

  const statusCopy =
    remindStatus === 'sent'
      ? t('pendingApproval.remindSuccess')
      : remindStatus === 'cooldown'
        ? t('pendingApproval.remindCooldown')
        : remindStatus === 'error'
          ? t('common.error')
          : null

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View style={[styles.iconTile, { backgroundColor: hexWithAlpha(c.info, 0.12) }]}>
          <Icon name="clock.fill" size={72} color="info" />
        </View>
        <Text
          variant="caption2"
          color="info"
          tracking="wide"
          align="center"
          style={styles.eyebrow}
        >
          {t('pendingApproval.eyebrow')}
        </Text>
        <Text variant="title1" color="primary" align="center" style={styles.title}>
          {t('pendingApproval.title')}
        </Text>
        <Text variant="body" color="secondary" align="center" style={styles.body}>
          {bodyText}
        </Text>

        {statusCopy ? (
          <Text
            variant="footnote"
            color={remindStatus === 'sent' ? 'success' : 'secondary'}
            align="center"
            style={styles.status}
          >
            {statusCopy}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {pendingJoinRequest && !isAgeGate ? (
            <Button
              label={t('pendingApproval.remindCta')}
              variant="filled"
              size="lg"
              fullWidth
              loading={remindLoading}
              disabled={remindStatus === 'sent' || remindStatus === 'cooldown'}
              onPress={() => void handleRemind()}
              testID="pending-approval-remind"
            />
          ) : null}
          <Button
            label={t('pendingApproval.checkStatus')}
            variant={pendingJoinRequest && !isAgeGate ? 'secondary' : 'filled'}
            size="lg"
            fullWidth
            onPress={() => void refreshUser()}
          />
          <Button
            label={t('pendingApproval.signOut')}
            variant="plain"
            size="lg"
            fullWidth
            onPress={handleSignOut}
          />
        </View>
      </View>
    </Screen>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 120,
    height: 120,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  eyebrow: { marginBottom: space.xs },
  title: { marginBottom: space.sm, paddingHorizontal: space.md },
  body: { maxWidth: 360, paddingHorizontal: space.md },
  status: { marginTop: space.md, paddingHorizontal: space.md },
  actions: {
    marginTop: space.xl,
    alignSelf: 'stretch',
    maxWidth: 360,
    gap: space.sm,
  },
})
