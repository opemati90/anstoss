import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { elevation, fonts, hairline, radius, space } from '../../theme/tokens'

export type FreeAgentProfile = {
  displayName: string
  position: string[]
  experienceYears: number
  location: string
  availableForTrials: boolean
  bio: string
}

type FreeAgentNextActionKind =
  | 'create-profile'
  | 'complete-profile'
  | 'enable-trials'
  | 'share-card'

export type FreeAgentNextAction = {
  kind: FreeAgentNextActionKind
  icon: string
  tone: 'primary' | 'warning'
  titleKey: string
  bodyKey: string
  bodyOptions?: Record<string, unknown>
  ctaKey: string
  accessibilityLabelKey: string
}

type ProfileLoadState = 'loading' | 'ready' | 'error'

const REQUIRED_FIELDS: Array<keyof FreeAgentProfile> = [
  'displayName',
  'position',
  'experienceYears',
  'location',
  'bio',
]

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
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

function isRequiredFieldFilled(
  field: keyof FreeAgentProfile,
  value: FreeAgentProfile[keyof FreeAgentProfile],
): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (field === 'experienceYears') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
  }
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

export function computeCompleteness(profile: FreeAgentProfile | null): number {
  if (!profile) return 0
  let filled = 0
  for (const field of REQUIRED_FIELDS) {
    const val = profile[field]
    if (isRequiredFieldFilled(field, val)) filled += 1
  }
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

export function getFreeAgentNextAction(
  profile: FreeAgentProfile | null,
  pct: number,
): FreeAgentNextAction {
  if (!profile) {
    return {
      kind: 'create-profile',
      icon: 'person.badge.plus',
      tone: 'primary',
      titleKey: 'home.freeAgent.createProfileTitle',
      bodyKey: 'home.freeAgent.createProfileBody',
      ctaKey: 'home.freeAgent.createProfileCta',
      accessibilityLabelKey: 'home.freeAgent.createProfileA11y',
    }
  }

  if (pct < 100) {
    return {
      kind: 'complete-profile',
      icon: 'square.and.pencil',
      tone: 'primary',
      titleKey: 'home.freeAgent.completeProfileTitle',
      bodyKey: 'home.freeAgent.completeProfileBody',
      bodyOptions: { pct },
      ctaKey: 'home.freeAgent.completeProfileCta',
      accessibilityLabelKey: 'home.freeAgent.completeProfileA11y',
    }
  }

  if (profile.availableForTrials !== true) {
    return {
      kind: 'enable-trials',
      icon: 'eye.slash',
      tone: 'warning',
      titleKey: 'home.freeAgent.enableTrialsTitle',
      bodyKey: 'home.freeAgent.enableTrialsBody',
      ctaKey: 'home.freeAgent.enableTrialsCta',
      accessibilityLabelKey: 'home.freeAgent.enableTrialsA11y',
    }
  }

  return {
    kind: 'share-card',
    icon: 'square.and.arrow.up',
    tone: 'primary',
    titleKey: 'home.freeAgent.shareCardTitle',
    bodyKey: 'home.freeAgent.shareCardBody',
    ctaKey: 'home.freeAgent.shareCardCta',
    accessibilityLabelKey: 'home.freeAgent.shareCardA11y',
  }
}

export function FreeAgentHome() {
  const c = useClubColors()
  const { t } = useTranslation()
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null)
  const [profileLoadState, setProfileLoadState] =
    useState<ProfileLoadState>('loading')

  const load = useCallback(async () => {
    setProfileLoadState('loading')
    try {
      const p = await api<FreeAgentProfile | null>('/me/free-agent-profile')
      setProfile(p ?? null)
      setProfileLoadState('ready')
    } catch {
      setProfileLoadState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pct = computeCompleteness(profile)
  const nextAction = useMemo(
    () =>
      profileLoadState === 'ready'
        ? getFreeAgentNextAction(profile, pct)
        : null,
    [pct, profile, profileLoadState],
  )

  const openProfile = useCallback(() => {
    router.push('/free-agent/profile' as never)
  }, [])

  return (
    <View style={styles.root}>
      {profileLoadState === 'loading' ? (
        <FreeAgentLoadingPanel />
      ) : profileLoadState === 'error' ? (
        <FreeAgentLoadErrorPanel onRetry={load} />
      ) : nextAction ? (
        <FreeAgentNextActionPanel
          action={nextAction}
          completion={pct}
          onPress={openProfile}
        />
      ) : null}

      {/* Trial invites empty state */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.freeAgent.trialInvites').toUpperCase()}
      </Text>
      <View style={[styles.row, elevation.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <View style={[styles.iconBubble, { backgroundColor: c.surfaceSunken ?? c.background }]}>
          <Icon name="envelope.fill" size={16} color="tertiary" />
        </View>
        <View style={styles.rowBody}>
          <Text variant="callout" color="primary" weight="semibold">
            {t('home.freeAgent.trialEmptyTitle')}
          </Text>
          <Text variant="caption2" color="secondary">
            {t('home.freeAgent.trialEmptyBody')}
          </Text>
        </View>
      </View>
    </View>
  )
}

function FreeAgentLoadingPanel() {
  const c = useClubColors()
  const { t } = useTranslation()

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('home.freeAgent.loadingA11y')}
      style={[
        styles.actionPanel,
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <View style={styles.actionHeader}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: c.surfaceSunken ?? c.background },
          ]}
        >
          <Icon name="clock" size={18} color="tertiary" />
        </View>
        <View style={styles.actionCopy}>
          <Text style={[styles.actionEyebrow, { color: c.textTertiary }]}>
            {t('home.freeAgent.nextActionEyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={2}>
            {t('home.freeAgent.loadingTitle')}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {t('home.freeAgent.loadingBody')}
          </Text>
        </View>
      </View>
      <View style={styles.progressBlock}>
        <View style={[styles.loadingLine, { backgroundColor: c.borderDefault }]} />
        <View
          style={[
            styles.loadingLineShort,
            { backgroundColor: c.surfaceSunken ?? c.borderDefault },
          ]}
        />
      </View>
      <View
        testID="free-agent-loading-action-placeholder"
        pointerEvents="none"
        accessible={false}
        style={[
          styles.actionButton,
          { backgroundColor: c.surfaceSunken ?? c.borderDefault },
        ]}
      >
        <View
          style={[
            styles.loadingButtonLine,
            { backgroundColor: c.borderDefault },
          ]}
        />
      </View>
    </View>
  )
}

function FreeAgentLoadErrorPanel({ onRetry }: { onRetry: () => void }) {
  const c = useClubColors()
  const { t } = useTranslation()

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${t('home.freeAgent.loadErrorTitle')}. ${t('home.freeAgent.loadErrorBody')}`}
      style={[
        styles.actionPanel,
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <View style={styles.actionHeader}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: withAlpha(c.warning, 0.12) },
          ]}
        >
          <Icon name="exclamationmark.triangle.fill" size={18} color={c.warning} />
        </View>
        <View style={styles.actionCopy}>
          <Text style={[styles.actionEyebrow, { color: c.textTertiary }]}>
            {t('home.freeAgent.nextActionEyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={2}>
            {t('home.freeAgent.loadErrorTitle')}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {t('home.freeAgent.loadErrorBody')}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => void onRetry()}
        accessibilityRole="button"
        accessibilityLabel={t('home.freeAgent.retryLoadA11y')}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: c.primary },
          pressed && { opacity: 0.86 },
        ]}
      >
        <Text style={[styles.actionButtonText, { color: c.textInverse }]} numberOfLines={1}>
          {t('home.freeAgent.retryLoadCta')}
        </Text>
        <Icon name="arrow.clockwise" size={14} color="inverse" />
      </Pressable>
    </View>
  )
}

function FreeAgentNextActionPanel({
  action,
  completion,
  onPress,
}: {
  action: FreeAgentNextAction
  completion: number
  onPress: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const accent = action.tone === 'warning' ? c.warning : c.primary
  const showProgress =
    action.kind === 'create-profile' || action.kind === 'complete-profile'

  return (
    <View
      style={[
        styles.actionPanel,
        elevation.hero,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <View style={styles.actionHeader}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: withAlpha(accent, 0.12) },
          ]}
        >
          <Icon name={action.icon} size={16} color={accent} />
        </View>
        <Text style={[styles.actionEyebrow, { color: c.textTertiary }]}>
          {t('home.freeAgent.nextActionEyebrow')}
        </Text>
      </View>
      <Text
        variant="title3"
        weight="semibold"
        color="primary"
        numberOfLines={2}
        style={styles.actionTitle}
      >
        {t(action.titleKey)}
      </Text>
      <Text variant="footnote" color="secondary" numberOfLines={2}>
        {t(action.bodyKey, action.bodyOptions)}
      </Text>

      {showProgress ? (
        <View style={styles.progressBlock}>
          <View style={[styles.track, { backgroundColor: c.borderDefault }]}>
            <View
              style={[
                styles.fill,
                { width: `${completion}%`, backgroundColor: c.primary },
              ]}
            />
          </View>
          <Text variant="caption2" color="secondary">
            {t('home.freeAgent.progressLabel', { pct: completion })}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t(action.accessibilityLabelKey)}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: c.primary },
          pressed && { opacity: 0.86 },
        ]}
      >
        <Text style={[styles.actionButtonText, { color: c.textInverse }]} numberOfLines={1}>
          {t(action.ctaKey)}
        </Text>
        <Icon name="chevron.right" size={14} color="inverse" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },

  actionPanel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.sm,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  actionTitle: {
    letterSpacing: -0.2,
  },
  actionEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  actionButton: {
    minHeight: 46,
    marginTop: space.xs,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  actionButtonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressBlock: {
    gap: space.xs,
  },
  loadingLine: {
    height: 4,
    width: '100%',
    borderRadius: radius.full,
  },
  loadingLineShort: {
    height: 4,
    width: '46%',
    borderRadius: radius.full,
  },
  loadingButtonLine: {
    height: 6,
    width: '34%',
    borderRadius: radius.full,
  },
  track: {
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: space.xs,
    marginBottom: -space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: space['2xs'] },
})
