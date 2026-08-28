import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Avatar, Button, ListRow, Screen, SectionGroup, Text } from '../src/components/ui'
import { OtpCellInput } from '../src/components/wizard/OtpCellInput'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

type ClubMember = {
  id: string
  userId: string
  role: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}

type OwnershipTransfer = {
  id: string
  fromUserId: string
  toUserId: string
  expiresAt: string
  club: { id: string; name: string; badgeUrl: string | null }
  fromUser: { id: string; name: string; email: string | null }
  toUser: { id: string; name: string; email: string | null }
}

export default function OwnershipTransfersScreen() {
  const { t } = useTranslation()
  const { user, activeClub, refreshUser, reauthenticate } = useAuth()
  const c = useClubColors()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [transfers, setTransfers] = useState<OwnershipTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [stepUpCode, setStepUpCode] = useState('')
  const [stepUpChallengeId, setStepUpChallengeId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'start'; member: ClubMember }
    | { kind: 'accept' | 'cancel'; transfer: OwnershipTransfer }
    | null
  >(null)

  const load = useCallback(async () => {
    try {
      const [transferRows, memberRows] = await Promise.all([
        api<OwnershipTransfer[]>('/ownership-transfers/mine'),
        activeClub
          ? api<ClubMember[]>(`/clubs/${activeClub.club.id}/members`)
          : Promise.resolve([]),
      ])
      setTransfers(Array.isArray(transferRows) ? transferRows : [])
      setMembers(Array.isArray(memberRows) ? memberRows : [])
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeClub, t])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load]),
  )

  const requestStepUp = async (
    action:
      | { kind: 'start'; member: ClubMember }
      | { kind: 'accept' | 'cancel'; transfer: OwnershipTransfer },
  ) => {
    if (!user?.email) {
      Alert.alert(t('common.error'), t('common.tryAgain'))
      return
    }
    setBusyId(action.kind === 'start' ? action.member.userId : action.transfer.id)
    try {
      if (action.kind === 'start') {
        if (!activeClub) return
        const challenge = await api<{ challengeId: string }>(
          `/clubs/${activeClub.club.id}/ownership-transfers/challenge`,
          { method: 'POST', body: { toUserId: action.member.userId } },
        )
        setStepUpChallengeId(challenge.challengeId)
      } else if (action.kind === 'accept') {
        const challenge = await api<{ challengeId: string }>(
          `/ownership-transfers/${action.transfer.id}/challenge`,
          { method: 'POST', body: {} },
        )
        setStepUpChallengeId(challenge.challengeId)
      } else {
        await api('/auth/otp/request', { method: 'POST', body: { email: user.email } })
        setStepUpChallengeId(null)
      }
      setStepUpCode('')
      setPendingAction(action)
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'))
    } finally {
      setBusyId(null)
    }
  }

  const performPendingAction = async () => {
    if (!pendingAction || stepUpCode.length !== 6) return
    const busyKey =
      pendingAction.kind === 'start' ? pendingAction.member.userId : pendingAction.transfer.id
    setBusyId(busyKey)
    try {
      if (pendingAction.kind === 'start') {
        if (!activeClub || !stepUpChallengeId) return
        await api(`/clubs/${activeClub.club.id}/ownership-transfers`, {
          method: 'POST',
          body: {
            toUserId: pendingAction.member.userId,
            challengeId: stepUpChallengeId,
            code: stepUpCode,
          },
        })
      } else if (pendingAction.kind === 'accept') {
        if (!stepUpChallengeId) return
        const { transfer } = pendingAction
        await api(`/ownership-transfers/${transfer.id}/accept`, {
          method: 'POST',
          body: { challengeId: stepUpChallengeId, code: stepUpCode },
        })
        await refreshUser(undefined, { preferredClubId: transfer.club.id })
      } else {
        await reauthenticate(stepUpCode)
        await api(`/ownership-transfers/${pendingAction.transfer.id}/cancel`, {
          method: 'POST',
          body: {},
        })
      }
      setPendingAction(null)
      setStepUpCode('')
      setStepUpChallengeId(null)
      await load()
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'))
    } finally {
      setBusyId(null)
    }
  }

  const startTransfer = (member: ClubMember) => {
    if (!activeClub) return
    Alert.alert(t('ownership.startTitle', { name: member.user.name }), t('ownership.startBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ownership.startAction'),
        style: 'destructive',
        onPress: () => void requestStepUp({ kind: 'start', member }),
      },
    ])
  }

  const actOnTransfer = async (transfer: OwnershipTransfer, action: 'accept' | 'cancel') => {
    await requestStepUp({ kind: action, transfer })
  }

  const isOwner = activeClub?.role === 'OWNER'
  const candidates = members.filter((member) => member.userId !== user?.id)

  return (
    <Screen
      header={<ModalHeader title={t('ownership.title')} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load()
          }}
        />
      }
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <>
          {pendingAction ? (
            <SectionGroup
              header={t('auth.signin.titleOtp')}
              footer={t('auth.signin.hintOtp', { identifier: user?.email ?? '' })}
              style={styles.section}
            >
              <View style={styles.stepUpContent}>
                <OtpCellInput value={stepUpCode} onChange={setStepUpCode} />
                <View style={styles.stepUpActions}>
                  <Button
                    label={t('common.cancel')}
                    variant="bordered"
                    size="sm"
                    onPress={() => {
                      setPendingAction(null)
                      setStepUpCode('')
                      setStepUpChallengeId(null)
                    }}
                  />
                  <Button
                    label={t('common.confirm')}
                    variant="filled"
                    size="sm"
                    loading={busyId !== null}
                    disabled={stepUpCode.length !== 6}
                    onPress={() => void performPendingAction()}
                  />
                </View>
              </View>
            </SectionGroup>
          ) : null}
          <SectionGroup
            header={t('ownership.pendingTitle')}
            footer={t('ownership.pendingHint')}
            style={styles.section}
          >
            {transfers.length === 0 ? (
              <ListRow title={t('ownership.none')} />
            ) : (
              transfers.map((transfer) => {
                const incoming = transfer.toUserId === user?.id
                return (
                  <View key={transfer.id} style={styles.transferRow}>
                    <ListRow
                      left={
                        <Avatar
                          size="md"
                          src={transfer.club.badgeUrl}
                          fallbackText={transfer.club.name}
                        />
                      }
                      title={transfer.club.name}
                      subtitle={
                        incoming
                          ? t('ownership.incomingFrom', { name: transfer.fromUser.name })
                          : t('ownership.outgoingTo', { name: transfer.toUser.name })
                      }
                    />
                    <Button
                      label={incoming ? t('ownership.accept') : t('ownership.cancel')}
                      variant={incoming ? 'filled' : 'bordered'}
                      size="sm"
                      loading={busyId === transfer.id}
                      onPress={() => void actOnTransfer(transfer, incoming ? 'accept' : 'cancel')}
                    />
                  </View>
                )
              })
            )}
          </SectionGroup>

          {isOwner ? (
            <SectionGroup
              header={t('ownership.chooseTitle')}
              footer={t('ownership.chooseHint')}
              style={styles.section}
            >
              {candidates.map((member) => (
                <ListRow
                  key={member.id}
                  left={
                    <Avatar size="md" src={member.user.avatarUrl} fallbackText={member.user.name} />
                  }
                  title={member.user.name}
                  subtitle={member.user.email}
                  right={
                    busyId === member.userId ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : undefined
                  }
                  showChevron={busyId !== member.userId}
                  onPress={() => startTransfer(member)}
                />
              ))}
            </SectionGroup>
          ) : null}

          <Text variant="footnote" color="secondary" style={styles.securityNote}>
            {t('ownership.securityNote')}
          </Text>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingVertical: space.md, paddingBottom: space['3xl'] },
  section: { marginBottom: space.lg },
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  transferRow: { paddingBottom: space.sm, paddingHorizontal: space.md, gap: space.xs },
  securityNote: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  stepUpContent: { padding: space.md, gap: space.md },
  stepUpActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
})
