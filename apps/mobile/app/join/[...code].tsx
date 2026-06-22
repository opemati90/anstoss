import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { PublicInvitePayload } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { FormInput } from '../../src/components/FormInput'
import { isValidEmail } from '../../src/utils/email'
import { setPendingInvite, clearPendingInvite } from '../../src/auth/pendingInvite'
import { Screen, Button, Text } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { elevation, space, radius, hairline } from '../../src/theme/tokens'

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body)
        .split(',')
        .map((p) => p.trim())
        .slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

type RedeemResult =
  | {
      status?: string
    }
  | undefined

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default function JoinInviteScreen() {
  const router = useRouter()
  const { code: segments } = useLocalSearchParams<{ code?: string | string[] }>()
  const { t } = useTranslation()
  const { isSignedIn, isLoading, ageGate, refreshUser, signOut } = useAuth()
  const c = useClubColors()
  const rawSegments = Array.isArray(segments) ? segments : segments ? [segments] : []
  // URL: /join/{slug}/{code} or /join/{codeOrSlug}
  const inviteCode = rawSegments.length >= 2 ? rawSegments[1] : rawSegments[0]

  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const [clubInfo, setClubInfo] = useState<{ id: string; name: string; slug: string; badgeUrl: string | null; primaryColor: string | null; memberCount: number; teamCount: number } | null>(null)
  const [isInviteLoading, setIsInviteLoading] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [guardianError, setGuardianError] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [childNameError, setChildNameError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!inviteCode) {
      setInviteError(t('join.invalidBody'))
      setIsInviteLoading(false)
      return
    }

    let isCancelled = false

    ;(async () => {
      setIsInviteLoading(true)
      setInviteError(null)

      try {
        const payload = await api<PublicInvitePayload>(`/public/invites/${inviteCode}`)
        if (isCancelled) return
        setInvite(payload)
      } catch {
        // Invite code lookup failed. Try as a club slug (from share links).
        try {
          const club = await api<{ id: string; name: string; slug: string; badgeUrl: string | null; primaryColor: string | null; memberCount: number; teamCount: number }>(`/public/clubs/${inviteCode}`)
          if (isCancelled) return
          setClubInfo(club)
        } catch (slugError) {
          if (!isCancelled) {
            setInviteError(
              slugError instanceof Error ? slugError.message : t('join.errorBody'),
            )
          }
        }
      } finally {
        if (!isCancelled) {
          setIsInviteLoading(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [inviteCode, t])

  const needsGuardianEmail =
    !!invite &&
    !!isSignedIn &&
    invite.kind !== 'PARENT_APPROVAL' &&
    invite.role === 'PLAYER' &&
    !!ageGate?.isUnder16

  const needsChildName =
    !!invite &&
    !!isSignedIn &&
    invite.role === 'PARENT'

  const isRedeemableStatus =
    invite?.status === 'PENDING' || invite?.status === 'SENT'

  const canRedeem =
    !!invite &&
    isSignedIn &&
    isRedeemableStatus

  const handleContinueToSignIn = async () => {
    if (!inviteCode) return
    // Carry the code through the unified sign-in so we can redeem the invite
    // once the user is authenticated (sign-in -> [about] -> back here). Persist
    // it too so a full app-kill mid-OTP (common: leaving for the SMS code)
    // doesn't lose the invite — the auth screens recover it on relaunch.
    await setPendingInvite(inviteCode)
    router.replace({ pathname: '/(auth)/sign-in', params: { inviteCode } })
  }

  const handleRedeem = async () => {
    if (!invite || !inviteCode) return

    if (needsGuardianEmail && !isValidEmail(guardianEmail)) {
      setGuardianError(t('join.guardianRequiredBody'))
      return
    }

    if (needsChildName && !childName.trim()) {
      setChildNameError(t('join.childNameRequiredBody'))
      return
    }

    setIsSubmitting(true)

    try {
      const result = await api<RedeemResult>(`/invites/${inviteCode}/redeem`, {
        method: 'POST',
        body: {
          guardianEmail: guardianEmail.trim()
            ? guardianEmail.trim().toLowerCase()
            : undefined,
          childName: childName.trim() || undefined,
        },
      })

      // Invite consumed — drop the persisted code so a later relaunch doesn't
      // bounce the user back here.
      await clearPendingInvite()
      await refreshUser()

      if (result?.status === 'pending_parent_approval') {
        Alert.alert(t('join.pendingTitle'), t('join.pendingBody'))
        router.replace('/pending-approval')
        return
      }

      Alert.alert(
        t('join.successTitle'),
        t('join.successBody', { teamName: invite.team.displayName }),
      )
      router.replace('/')
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('different email address')
      ) {
        Alert.alert(
          t('join.emailMismatchTitle'),
          t('join.emailMismatchBodyWithoutTarget'),
          [
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
            {
              text: t('join.switchAccountCta'),
              onPress: () => {
                void signOut().then(async () => {
                  await setPendingInvite(inviteCode)
                  router.replace({
                    pathname: '/(auth)/sign-in',
                    params: { inviteCode },
                  })
                })
              },
            },
          ],
        )
        return
      }

      Alert.alert(
        t('join.redeemErrorTitle'),
        error instanceof Error ? error.message : t('join.redeemErrorBody'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isInviteLoading || isLoading) {
    return (
      <Screen header={<ModalHeader />} padded={false}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={c.textPrimary} />
          <Text variant="title2" color="primary" weight="semibold" align="center" style={styles.stateTitle}>
            {t('join.loadingTitle')}
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.stateBody}>
            {t('join.loadingBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  if (!inviteCode) {
    return (
      <Screen header={<ModalHeader />} padded={false}>
        <View style={styles.centeredState}>
          <Text variant="title2" color="primary" weight="semibold" align="center" style={styles.stateTitle}>
            {t('join.invalidTitle')}
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.stateBody}>
            {t('join.invalidBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  if (clubInfo && !invite) {
    return (
      <Screen header={<ModalHeader />} padded={false}>
        <View style={styles.centeredState}>
          <Text variant="title2" color="primary" weight="semibold" align="center" style={styles.stateTitle}>
            {clubInfo.name}
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.stateBody}>
            {t('join.clubInfoBody', { memberCount: clubInfo.memberCount, teamCount: clubInfo.teamCount })}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: space.lg }}>
            <Button
              label={t('join.requestToJoin')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() =>
                router.replace({
                  pathname: isSignedIn ? '/join-club' : '/(auth)/welcome',
                  params: isSignedIn
                    ? { slug: clubInfo.slug }
                    : { joinClubSlug: clubInfo.slug },
                })
              }
            />
          </View>
        </View>
      </Screen>
    )
  }

  if (!invite || inviteError) {
    return (
      <Screen header={<ModalHeader />} padded={false}>
        <View style={styles.centeredState}>
          <Text variant="title2" color="primary" weight="semibold" align="center" style={styles.stateTitle}>
            {t('join.errorTitle')}
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.stateBody}>
            {inviteError || t('join.errorBody')}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: space.lg }}>
            <Button
              label={t('common.retry')}
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })}
            />
          </View>
        </View>
      </Screen>
    )
  }

  const inviteTypeLabel = t(`join.kind.${invite.kind}`)
  const statusLabel = t(`join.status.${invite.status}`)
  const phaseLabel = t(
    invite.phase === 'TRIAL' ? 'invite.phaseTrial' : 'invite.phaseFull',
  )
  const roleLabel = t(`teamRoles.${invite.role}`)
  const inactiveBody =
    invite.status === 'ACCEPTED'
      ? t('join.acceptedBody')
      : invite.status === 'EXPIRED'
        ? t('join.expiredBody')
        : invite.status === 'REVOKED'
          ? t('join.revokedBody')
          : null

  return (
    <Screen header={<ModalHeader />} scroll padded={false}>
      <View style={styles.content}>
      <View
        style={[
          styles.heroCard,
          elevation.card,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <Text variant="caption2" color="tertiary" style={styles.eyebrow}>
          {t('join.eyebrow').toUpperCase()}
        </Text>
        <View style={styles.heroHeader}>
          {invite.club.badgeUrl ? (
            <Image
              source={{ uri: invite.club.badgeUrl }}
              style={[styles.badge, { backgroundColor: c.background }]}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.badgeFallback,
                { borderColor: c.borderDefault, backgroundColor: c.background },
              ]}
            >
              <Text variant="title2" color="primary" weight="semibold">
                {invite.club.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.heroCopy}>
            <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
              {invite.club.name}
            </Text>
            <Text variant="headline" color="primary">
              {invite.team.displayName}
            </Text>
            <Text variant="footnote" color="secondary">
              {invite.team.group.displayName}
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
            <Text variant="caption1" weight="semibold" style={[styles.chipText, { color: c.primary }]}>
              {inviteTypeLabel}
            </Text>
          </View>
          <View
            style={[
              styles.ghostChip,
              { borderColor: c.borderDefault, backgroundColor: c.background },
            ]}
          >
            <Text variant="caption1" color="secondary" weight="medium">
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.panel,
          elevation.card,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <Text variant="caption2" color="tertiary" style={styles.sectionLabel}>
          {t('join.inviteTypeLabel').toUpperCase()}
        </Text>
        <View style={styles.detailGrid}>
          <Detail label={t('join.teamLabel')} value={invite.team.displayName} />
          <Detail label={t('join.groupLabel')} value={invite.team.group.displayName} />
          <Detail label={t('join.roleLabel')} value={roleLabel} />
          <Detail label={t('join.phaseLabel')} value={phaseLabel} />
          <Detail label={t('join.expiresLabel')} value={formatDate(invite.expiresAt)} />
          <Detail label={t('join.inviteTypeLabel')} value={inviteTypeLabel} />
        </View>
      </View>

      {invite.kind === 'PARENT_APPROVAL' ? (
        <View
          style={[
            styles.notePanel,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text variant="callout" color="primary" weight="semibold">
            {t('join.parentApprovalTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('join.parentApprovalBody')}
          </Text>
        </View>
      ) : null}

      {invite.phase === 'TRIAL' ? (
        <View
          style={[
            styles.notePanel,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text variant="callout" color="primary" weight="semibold">
            {t('join.trialTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('join.trialBody')}
          </Text>
        </View>
      ) : null}

      {!isSignedIn && isRedeemableStatus ? (
        <View
          style={[
            styles.panel,
            elevation.card,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text variant="title3" color="primary" weight="semibold">
            {t('join.signInTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('join.signInBody')}
          </Text>
          <Button
            label={t('join.signInCta')}
            variant="filled"
            size="lg"
            fullWidth
            onPress={handleContinueToSignIn}
          />
        </View>
      ) : null}

      {isSignedIn && isRedeemableStatus ? (
        <View
          style={[
            styles.panel,
            elevation.card,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text variant="title3" color="primary" weight="semibold">
            {t('join.readyTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('join.readyBody')}
          </Text>

          {needsGuardianEmail ? (
            <FormInput
              label={t('invite.guardianPlaceholder')}
              style={{ backgroundColor: c.background }}
              value={guardianEmail}
              onChangeText={(text) => { setGuardianEmail(text); setGuardianError(null) }}
              placeholder={t('invite.guardianPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={guardianError}
            />
          ) : null}

          {needsChildName ? (
            <FormInput
              label={t('invite.childNamePlaceholder')}
              style={{ backgroundColor: c.background }}
              value={childName}
              onChangeText={(text) => { setChildName(text); setChildNameError(null) }}
              placeholder={t('invite.childNamePlaceholder')}
              error={childNameError}
            />
          ) : null}

          <Button
            label={t('join.redeemCta')}
            variant="filled"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={!canRedeem}
            onPress={() => void handleRedeem()}
          />
        </View>
      ) : null}

      {!isRedeemableStatus && inactiveBody ? (
        <View
          style={[
            styles.notePanel,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text variant="callout" color="primary" weight="semibold">
            {t('join.inactiveTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {inactiveBody}
          </Text>
        </View>
      ) : null}
      </View>
    </Screen>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailBlock}>
      <Text variant="caption2" color="tertiary" style={styles.detailLabel}>
        {label.toUpperCase()}
      </Text>
      <Text variant="subheadline" color="primary" weight="medium">{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  stateTitle: {
    marginTop: space.md,
  },
  stateBody: {
    marginTop: space.sm,
  },
  heroCard: {
    borderWidth: hairline,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  eyebrow: {},
  heroHeader: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xs,
    alignItems: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    letterSpacing: -0.3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  chip: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {},
  ghostChip: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairline,
  },
  panel: {
    borderWidth: hairline,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  notePanel: {
    borderWidth: hairline,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  sectionLabel: {},
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.md,
  },
  detailBlock: {
    width: '48%',
    gap: space.xs,
  },
  detailLabel: {},
})
