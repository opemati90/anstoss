import { useEffect, useState } from 'react'
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
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight } from '../../src/theme/tokens'

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
  const rawSegments = Array.isArray(segments) ? segments : segments ? [segments] : []
  // URL: /join/{slug}/{code} or /join/{codeOrSlug}
  const inviteCode = rawSegments.length >= 2 ? rawSegments[1] : rawSegments[0]

  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const [clubInfo, setClubInfo] = useState<{ id: string; name: string; slug: string; badgeUrl: string | null; primaryColor: string | null; memberCount: number; teamCount: number } | null>(null)
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
                void signOut().then(() => {
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

  if (clubInfo && !invite) {
    return (
      <View style={styles.outerContainer}>
        <ModalHeader />
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>{clubInfo.name}</Text>
          <Text style={styles.stateBody}>
            {t('join.clubInfoBody', { memberCount: clubInfo.memberCount, teamCount: clubInfo.teamCount })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: clubInfo.primaryColor || neutralColors.textPrimary }]}
            onPress={() =>
              router.replace({
                pathname: isSignedIn ? '/join-club' : '/(auth)/sign-in',
                params: isSignedIn
                  ? { slug: clubInfo.slug }
                  : { joinClubSlug: clubInfo.slug },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('join.requestToJoin')}
          >
            <Text style={styles.primaryButtonText}>{t('join.requestToJoin')}</Text>
          </TouchableOpacity>
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
          onPress={() => router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
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
            accessibilityRole="button"
            accessibilityLabel={t('join.signInCta')}
          >
            <Text style={styles.primaryButtonText}>{t('join.signInCta')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isSignedIn && isRedeemableStatus ? (
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
              accessibilityLabel={t('invite.guardianPlaceholder')}
            />
          ) : null}

          {needsChildName ? (
            <TextInput
              style={[styles.input, needsGuardianEmail && styles.spacedInput]}
              value={childName}
              onChangeText={setChildName}
              placeholder={t('invite.childNamePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              accessibilityLabel={t('invite.childNamePlaceholder')}
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
            accessibilityRole="button"
            accessibilityLabel={t('join.redeemCta')}
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
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.xl,
  },
  stateTitle: {
    marginTop: space.md,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    marginTop: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: 22,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.lg,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.sm,
    alignItems: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.background,
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFallbackText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    letterSpacing: -0.6,
  },
  heroCopy: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  metaText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  chip: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ghostChip: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  ghostChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  panel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.lg,
    gap: space.md,
  },
  notePanel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  warningPanel: {
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
    borderRadius: radius.lg,
    backgroundColor: `${semanticColors.warning}10`,
    padding: space.md,
    gap: space.sm,
  },
  warningTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  warningBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 21,
    color: neutralColors.textSecondary,
  },
  noteTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  noteBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 21,
    color: neutralColors.textSecondary,
  },
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
  detailLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  detailValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.data,
    lineHeight: 21,
    color: neutralColors.textPrimary,
    flexShrink: 1,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  spacedInput: {
    marginTop: -4,
  },
  primaryButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    marginTop: space.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
