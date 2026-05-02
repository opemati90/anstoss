import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { PublicInvitePayload } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { InlineError } from '../../src/components/InlineError'
import { isValidEmail } from '../../src/utils/email'
import { Screen, Button, Text} from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, space, radius, fonts, lineHeight ,
  hairline} from '../../src/theme/tokens'

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
    router.replace({ pathname: '/(auth)/welcome', params: { inviteCode } })
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
                    pathname: '/(auth)/welcome',
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
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {t('join.loadingTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
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
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {t('join.invalidTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
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
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {clubInfo.name}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
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
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>
            {t('join.errorTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: c.textSecondary }]}>
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

  const accentColor = invite.club.primaryColor || c.textPrimary
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
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {t('join.eyebrow')}
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
              <Text style={[styles.badgeFallbackText, { color: c.textPrimary }]}>
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
            <Text style={[styles.title, { color: c.textPrimary }]}>
              {invite.club.name}
            </Text>
            <Text style={[styles.subtitle, { color: c.textPrimary }]}>
              {invite.team.displayName}
            </Text>
            <Text style={[styles.metaText, { color: c.textSecondary }]}>
              {invite.team.group.displayName}
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: accentColor }]}>
            <Text style={[styles.chipText, { color: c.textInverse }]}>
              {inviteTypeLabel}
            </Text>
          </View>
          <View
            style={[
              styles.ghostChip,
              { borderColor: c.borderDefault, backgroundColor: c.background },
            ]}
          >
            <Text style={[styles.ghostChipText, { color: c.textPrimary }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.panel,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('join.inviteTypeLabel')}
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
          <Text style={[styles.noteTitle, { color: c.textPrimary }]}>
            {t('join.parentApprovalTitle')}
          </Text>
          <Text style={[styles.noteBody, { color: c.textSecondary }]}>
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
          <Text style={[styles.noteTitle, { color: c.textPrimary }]}>
            {t('join.trialTitle')}
          </Text>
          <Text style={[styles.noteBody, { color: c.textSecondary }]}>
            {t('join.trialBody')}
          </Text>
        </View>
      ) : null}

      {!isSignedIn && isRedeemableStatus ? (
        <View
          style={[
            styles.panel,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
            {t('join.signInTitle')}
          </Text>
          <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
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
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
            {t('join.readyTitle')}
          </Text>
          <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
            {t('join.readyBody')}
          </Text>

          {needsGuardianEmail ? (
            <>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: guardianError ? c.error : c.borderDefault,
                    backgroundColor: c.background,
                    color: c.textPrimary,
                  },
                ]}
                value={guardianEmail}
                onChangeText={(text) => { setGuardianEmail(text); setGuardianError(null) }}
                placeholder={t('invite.guardianPlaceholder')}
                placeholderTextColor={c.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('invite.guardianPlaceholder')}
              />
              <InlineError message={guardianError} />
            </>
          ) : null}

          {needsChildName ? (
            <>
              <TextInput
                style={[
                  styles.input,
                  needsGuardianEmail && styles.spacedInput,
                  {
                    borderColor: childNameError ? c.error : c.borderDefault,
                    backgroundColor: c.background,
                    color: c.textPrimary,
                  },
                ]}
                value={childName}
                onChangeText={(text) => { setChildName(text); setChildNameError(null) }}
                placeholder={t('invite.childNamePlaceholder')}
                placeholderTextColor={c.textTertiary}
                accessibilityLabel={t('invite.childNamePlaceholder')}
              />
              <InlineError message={childNameError} />
            </>
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
          <Text style={[styles.noteTitle, { color: c.textPrimary }]}>
            {t('join.inactiveTitle')}
          </Text>
          <Text style={[styles.noteBody, { color: c.textSecondary }]}>
            {inactiveBody}
          </Text>
        </View>
      ) : null}
      </View>
    </Screen>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  const c = useClubColors()
  return (
    <View style={styles.detailBlock}>
      <Text style={[styles.detailLabel, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: c.textPrimary }]}>{value}</Text>
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
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  stateBody: {
    marginTop: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  heroCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
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
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFallbackText: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
    letterSpacing: -0.6,
  },
  heroCopy: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.label,
  },
  metaText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  chip: {
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  ghostChip: {
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairline,
  },
  ghostChipText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  panel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  notePanel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  noteTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  noteBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
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
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  detailValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.data,
    lineHeight: lineHeight.sm,
    flexShrink: 1,
  },
  input: {
    height: 52,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  spacedInput: {
    marginTop: -4,
  },
})
