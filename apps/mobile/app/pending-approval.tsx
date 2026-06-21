import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { radius, space } from '../src/theme/tokens'

type ActiveJoinRequestResponse = {
  request: {
    id: string
    clubId: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
  } | null
}

type PendingJoinRequest = { id: string; clubId: string }

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut, refreshUser, pendingJoinRequest } = useAuth()
  const c = useClubColors()
  const [remindStatus, setRemindStatus] =
    useState<'idle' | 'sent' | 'cooldown' | 'error'>('idle')
  const [remindLoading, setRemindLoading] = useState(false)
  const [checkStatus, setCheckStatus] =
    useState<'idle' | 'stillPending' | 'updated' | 'error'>('idle')
  const [checkLoading, setCheckLoading] = useState(false)
  const [activeJoinRequest, setActiveJoinRequest] =
    useState<PendingJoinRequest | null | undefined>(undefined)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const remindRunRef = useRef(0)

  useEffect(() => {
    setActiveJoinRequest(undefined)
  }, [pendingJoinRequest])

  // Background poll: every 30s ask the API whether the request is still
  // pending. When the row disappears (approved or revoked), drop into
  // refreshUser() so the AuthContext picks up the new membership and
  // routes the user out of /pending-approval automatically.
  useEffect(() => {
    if (ageGate && (ageGate as { status?: string }).status === 'PENDING_PARENT_APPROVAL') {
      return
    }
    let isMounted = true
    const tick = async () => {
      try {
        const res = await api<ActiveJoinRequestResponse>('/me/join-requests/active')
        if (!isMounted) return
        if (!res.request || res.request.status !== 'PENDING') {
          remindRunRef.current += 1
          setRemindLoading(false)
          setActiveJoinRequest(null)
          setCheckStatus('idle')
          setRemindStatus('idle')
          await refreshUser(undefined, { throwOnError: true })
          if (isMounted) {
            router.replace('/')
          }
          return
        }
        setActiveJoinRequest({ id: res.request.id, clubId: res.request.clubId })
      } catch {
        // Network blip — quietly try again next interval
      }
    }
    void tick()
    pollingRef.current = setInterval(() => void tick(), 30_000)
    return () => {
      isMounted = false
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [ageGate, refreshUser])

  const isAgeGate =
    !!ageGate && (ageGate as { status?: string }).status === 'PENDING_PARENT_APPROVAL'
  const effectiveJoinRequest = activeJoinRequest ?? null

  const handleSignOut = () => {
    void signOut()
    router.replace('/(auth)/welcome')
  }

  const handleRemind = async () => {
    if (!effectiveJoinRequest) return
    const remindRunId = ++remindRunRef.current
    setRemindLoading(true)
    setRemindStatus('idle')
    setCheckStatus('idle')
    try {
      await api(
        `/clubs/${effectiveJoinRequest.clubId}/join-requests/${effectiveJoinRequest.id}/remind`,
        { method: 'POST' },
      )
      if (remindRunId === remindRunRef.current) {
        setRemindStatus('sent')
      }
    } catch (e) {
      if (remindRunId === remindRunRef.current) {
        if (e instanceof ApiError && e.status === 400) {
          setRemindStatus('cooldown')
        } else {
          setRemindStatus('error')
        }
      }
    } finally {
      if (remindRunId === remindRunRef.current) {
        setRemindLoading(false)
      }
    }
  }

  const handleCheckStatus = async () => {
    setCheckLoading(true)
    setCheckStatus('idle')
    setRemindStatus('idle')
    try {
      if (isAgeGate) {
        await refreshUser(undefined, { throwOnError: true })
        setCheckStatus('updated')
        router.replace('/')
        return
      }

      const res = await api<ActiveJoinRequestResponse>('/me/join-requests/active')
      if (!res.request || res.request.status !== 'PENDING') {
        remindRunRef.current += 1
        setRemindLoading(false)
        setActiveJoinRequest(null)
        await refreshUser(undefined, { throwOnError: true })
        setCheckStatus('updated')
        router.replace('/')
        return
      }

      setActiveJoinRequest({ id: res.request.id, clubId: res.request.clubId })
      setCheckStatus('stillPending')
    } catch {
      setCheckStatus('error')
    } finally {
      setCheckLoading(false)
    }
  }

  const bodyText = isAgeGate
    ? t('pendingApproval.ageGateBody', {
        email: (ageGate as { guardianEmail?: string })?.guardianEmail ?? '',
      })
    : t('pendingApproval.body')

  let statusCopy: string | null = null
  if (checkStatus === 'stillPending') {
    statusCopy = t('pendingApproval.checkStillPending', {
      defaultValue: 'Still waiting on the club. We will keep checking.',
    })
  } else if (checkStatus === 'updated') {
    statusCopy = t('pendingApproval.checkUpdated', {
      defaultValue: 'Status changed. Refreshing your account.',
    })
  } else if (checkStatus === 'error') {
    statusCopy = t('pendingApproval.checkError', {
      defaultValue: "Couldn't check right now. Try again.",
    })
  } else if (remindStatus === 'sent') {
    statusCopy = t('pendingApproval.remindSuccess')
  } else if (remindStatus === 'cooldown') {
    statusCopy = t('pendingApproval.remindCooldown')
  } else if (remindStatus === 'error') {
    statusCopy = t('common.error')
  }
  const statusTone =
    checkStatus === 'updated' || remindStatus === 'sent'
      ? 'success'
      : 'secondary'

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
            color={statusTone}
            align="center"
            style={styles.status}
          >
            {statusCopy}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {effectiveJoinRequest && !isAgeGate ? (
            <Button
              label={t('pendingApproval.remindCta')}
              variant="filled"
              size="lg"
              fullWidth
              loading={remindLoading}
              disabled={checkLoading || remindStatus === 'sent' || remindStatus === 'cooldown'}
              onPress={() => void handleRemind()}
              testID="pending-approval-remind"
            />
          ) : null}
          <Button
            label={t('pendingApproval.checkStatus')}
            variant={effectiveJoinRequest && !isAgeGate ? 'secondary' : 'filled'}
            size="lg"
            fullWidth
            loading={checkLoading}
            disabled={remindLoading}
            onPress={() => void handleCheckStatus()}
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
