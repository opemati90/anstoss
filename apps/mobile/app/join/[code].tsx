import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { PublicInvitePayload } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { neutralColors, semanticColors } from '../../src/theme/tokens'

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
  const { code } = useLocalSearchParams<{ code?: string | string[] }>()
  const { t } = useTranslation()
  const { user, isSignedIn, isLoading, ageGate, refreshUser, signOut } = useAuth()
  const inviteCode = Array.isArray(code) ? code[0] : code

  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const [isInviteLoading, setIsInviteLoading] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [childName, setChildName] = useState('')
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
        setGuardianEmail(payload.guardianEmail || '')
        setChildName(payload.childName || '')
      } catch (error) {
        if (!isCancelled) {
          setInviteError(
            error instanceof Error ? error.message : t('join.errorBody'),
          )
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

  const emailMismatch = useMemo(() => {
    if (!invite?.recipientEmail || !user?.email) return false
    return user.email.toLowerCase() !== invite.recipientEmail.toLowerCase()
  }, [invite?.recipientEmail, user?.email])

  const needsGuardianEmail =
    !!invite &&
    !!isSignedIn &&
    invite.kind !== 'PARENT_APPROVAL' &&
    invite.role === 'PLAYER' &&
    !!ageGate?.isUnder16 &&
    !invite.guardianEmail

  const needsChildName =
    !!invite &&
    !!isSignedIn &&
    invite.role === 'PARENT' &&
    !invite.childName

  const isRedeemableStatus =
    invite?.status === 'PENDING' || invite?.status === 'SENT'

  const canRedeem =
    !!invite &&
    isSignedIn &&
    !emailMismatch &&
    isRedeemableStatus

  const handleContinueToSignIn = async () => {
    if (!inviteCode) return

    if (emailMismatch) {
      await signOut()
    }

    router.replace({ pathname: '/(auth)/sign-in', params: { inviteCode } })
  }

  const handleRedeem = async () => {
    if (!invite || !inviteCode) return

    if (needsGuardianEmail && !guardianEmail.trim().includes('@')) {
      Alert.alert(
        t('join.guardianRequiredTitle'),
        t('join.guardianRequiredBody'),
      )
      return
    }

    if (needsChildName && !childName.trim()) {
      Alert.alert(
        t('join.childNameRequiredTitle'),
        t('join.childNameRequiredBody'),
      )
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
      <View style={styles.outerContainer}>
        <ModalHeader />
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={neutralColors.textPrimary} />
        <Text style={styles.stateTitle}>{t('join.loadingTitle')}</Text>
          <Text style={styles.stateBody}>{t('join.loadingBody')}</Text>
        </View>
      </View>
    )
  }

  if (!inviteCode) {
    return (
      <View style={styles.outerContainer}>
        <ModalHeader />
        <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>{t('join.invalidTitle')}</Text>
          <Text style={styles.stateBody}>{t('join.invalidBody')}</Text>
        </View>
      </View>
    )
  }

  if (!invite || inviteError) {
    return (
      <View style={styles.outerContainer}>
        <ModalHeader />
        <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>{t('join.errorTitle')}</Text>
        <Text style={styles.stateBody}>{inviteError || t('join.errorBody')}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })}
        >
            <Text style={styles.secondaryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const accentColor = invite.club.primaryColor || neutralColors.textPrimary
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
    <View style={styles.outerContainer}>
      <ModalHeader />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>{t('join.eyebrow')}</Text>
        <View style={styles.heroHeader}>
          {invite.club.badgeUrl ? (
            <Image
              source={{ uri: invite.club.badgeUrl }}
              style={styles.badge}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.badgeFallback}>
              <Text style={styles.badgeFallbackText}>
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
            <Text style={styles.title}>{invite.club.name}</Text>
            <Text style={styles.subtitle}>{invite.team.displayName}</Text>
            <Text style={styles.metaText}>{invite.team.group.displayName}</Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: accentColor }]}>
            <Text style={styles.chipText}>{inviteTypeLabel}</Text>
          </View>
          <View style={styles.ghostChip}>
            <Text style={styles.ghostChipText}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>{t('join.inviteTypeLabel')}</Text>
        <View style={styles.detailGrid}>
          <Detail label={t('join.teamLabel')} value={invite.team.displayName} />
          <Detail label={t('join.groupLabel')} value={invite.team.group.displayName} />
          <Detail label={t('join.roleLabel')} value={roleLabel} />
          <Detail label={t('join.phaseLabel')} value={phaseLabel} />
          <Detail label={t('join.expiresLabel')} value={formatDate(invite.expiresAt)} />
          <Detail label={t('join.inviteTypeLabel')} value={inviteTypeLabel} />
          {invite.childName ? (
            <Detail label={t('join.childLabel')} value={invite.childName} />
          ) : null}
          {invite.guardianEmail ? (
            <Detail label={t('join.guardianLabel')} value={invite.guardianEmail} />
          ) : null}
        </View>
      </View>

      {invite.kind === 'PARENT_APPROVAL' ? (
        <View style={styles.notePanel}>
          <Text style={styles.noteTitle}>{t('join.parentApprovalTitle')}</Text>
          <Text style={styles.noteBody}>{t('join.parentApprovalBody')}</Text>
        </View>
      ) : null}

      {invite.phase === 'TRIAL' ? (
        <View style={styles.notePanel}>
          <Text style={styles.noteTitle}>{t('join.trialTitle')}</Text>
          <Text style={styles.noteBody}>{t('join.trialBody')}</Text>
        </View>
      ) : null}

      {!isSignedIn && isRedeemableStatus ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{t('join.signInTitle')}</Text>
          <Text style={styles.sectionBody}>{t('join.signInBody')}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleContinueToSignIn}
          >
            <Text style={styles.primaryButtonText}>{t('join.signInCta')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {emailMismatch ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>{t('join.emailMismatchTitle')}</Text>
          <Text style={styles.warningBody}>
            {t('join.emailMismatchBody', {
              email: invite.recipientEmail,
            })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={() => void handleContinueToSignIn()}
          >
            <Text style={styles.primaryButtonText}>
              {t('join.switchAccountCta')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isSignedIn && !emailMismatch && isRedeemableStatus ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{t('join.readyTitle')}</Text>
          <Text style={styles.sectionBody}>{t('join.readyBody')}</Text>

          {needsGuardianEmail ? (
            <TextInput
              style={styles.input}
              value={guardianEmail}
              onChangeText={setGuardianEmail}
              placeholder={t('invite.guardianPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}

          {needsChildName ? (
            <TextInput
              style={[styles.input, needsGuardianEmail && styles.spacedInput]}
              value={childName}
              onChangeText={setChildName}
              placeholder={t('invite.childNamePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />
          ) : null}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: accentColor },
              (!canRedeem || isSubmitting) && styles.buttonDisabled,
            ]}
            onPress={() => void handleRedeem()}
            disabled={!canRedeem || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={neutralColors.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>{t('join.redeemCta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {!isRedeemableStatus && inactiveBody ? (
        <View style={styles.notePanel}>
          <Text style={styles.noteTitle}>{t('join.inactiveTitle')}</Text>
          <Text style={styles.noteBody}>{inactiveBody}</Text>
        </View>
      ) : null}
      </ScrollView>
    </View>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailBlock}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: neutralColors.background,
    paddingHorizontal: 28,
  },
  stateTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 16,
    backgroundColor: neutralColors.surface,
    padding: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: neutralColors.background,
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFallbackText: {
    fontSize: 22,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: -0.6,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  metaText: {
    fontSize: 14,
    color: neutralColors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  chip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textInverse,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ghostChip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  ghostChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  panel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 16,
    backgroundColor: neutralColors.surface,
    padding: 20,
    gap: 14,
  },
  notePanel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 14,
    backgroundColor: neutralColors.surface,
    padding: 18,
    gap: 6,
  },
  warningPanel: {
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
    borderRadius: 14,
    backgroundColor: `${semanticColors.warning}10`,
    padding: 18,
    gap: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  warningBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: neutralColors.textSecondary,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 21,
    color: neutralColors.textSecondary,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  detailBlock: {
    width: '48%',
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 21,
    color: neutralColors.textPrimary,
    flexShrink: 1,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 10,
    backgroundColor: neutralColors.background,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
  },
  spacedInput: {
    marginTop: -4,
  },
  primaryButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
