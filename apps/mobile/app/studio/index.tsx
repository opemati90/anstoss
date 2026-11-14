import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { StudioStyle, StudioTemplate } from '@anstoss/shared'
import { useClubColors, useIsDark } from '../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { ClubScreenHeader } from '../../src/components/club/ClubScreenHeader'
import { EmptyState } from '../../src/components/EmptyState'
import { Icon, Text } from '../../src/components/ui'
import { MatchCrest } from '../../src/components/match/MatchCrest'
import { StudioGraphic } from '../../src/components/studio/StudioGraphic'
import { CreditsChip } from '../../src/components/studio/StudioBits'
import { StudioLocked } from '../../src/components/studio/StudioLocked'
import {
  useStudioAccess,
  useStudioBrandKit,
  useStudioCredits,
  useStudioMatch,
} from '../../src/hooks/useStudio'
import { useGraphicBuilder } from '../../src/studio/useGraphicData'
import { studioShortCode } from '../../src/studio/buildGraphicData'
import { buildSuggestion } from '../../src/studio/suggestion'
import { HOME_CLUB_RAIL, HOME_MATCH_RAIL, templateSlug } from '../../src/studio/templates'
import {
  STUDIO_ACCENT,
  STUDIO_INK,
  STUDIO_ON_WORKSPACE,
  STUDIO_WORKSPACE_MUTED,
} from '../../src/theme/studio'
import {
  RADIUS_MD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
  SPACING_XXXL,
} from '../../src/theme/tokens'

/** Board 38 (StudioHome.dc.html) measures. */
const PAGE_TOP = 12
const PAGE_GAP = 22
const NOW_RADIUS = 24
const NOW_THUMB = 84
const NOW_THUMB_RADIUS = 10
const NOW_TITLE = 17
const THUMB_WIDTH = 118
const CLIP_WIDTH = 84
const THUMB_HEIGHT = 148
const RAIL_BOTTOM = 6
const KIT_RADIUS = 18
const KIT_PAD_V = 10
const KIT_PAD_H = 14
const KIT_HEIGHT = 60
const KIT_CREST = 30
const KIT_GAP = 14

/**
 * Matchday Studio home (board 38): credits chip, the ink "Jetzt dran"
 * suggestion, the Spieltag and Verein template rails and the Brand-Kit row.
 * Free clubs see StudioLocked (board 41) with the way into the Abo.
 */
export default function StudioHomeScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const insets = useSafeAreaInsetsSafe()
  const { eventId } = useLocalSearchParams<{ eventId?: string }>()
  const access = useStudioAccess()
  const { kit } = useStudioBrandKit()
  const { balance, refresh: refreshCredits } = useStudioCredits()
  const { match, live, event, refresh: refreshMatch } = useStudioMatch(eventId ?? null)
  const { build } = useGraphicBuilder(match, kit)

  useFocusEffect(
    useCallback(() => {
      void refreshCredits()
      void refreshMatch()
    }, [refreshCredits, refreshMatch]),
  )

  const suggestion = useMemo(
    () => buildSuggestion(match, { kickoffAt: live?.kickoffAt, finishedAt: live?.finishedAt }, t as never),
    [match, live, t],
  )
  const base = useMemo(() => build('FULL_TIME'), [build])
  // Tor needs a goal to draw: the thumbnail previews one when there is none yet.
  const goalPreview = useMemo(
    () => (base.goal ? base : build('GOAL', { scoreOverride: { goalsFor: 1, goalsAgainst: 0 } })),
    [base, build],
  )
  const dataFor = (template: StudioTemplate) =>
    template === 'GOAL' ? goalPreview : template === 'HALF_TIME' ? build('HALF_TIME') : base

  if (access.loading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }
  if (!access.unlocked) return <StudioLocked build={build} />
  if (!access.allowed) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-no-access">
        <View style={[styles.content, { paddingTop: insets.top + PAGE_TOP }]}>
          <ClubScreenHeader title={t('studio.title')} fallbackHref="/(tabs)/more" />
        </View>
        <EmptyState icon="camera" title={t('studio.home.noAccessTitle')} description={t('studio.home.noAccessBody')} />
      </View>
    )
  }

  const open = (template: StudioTemplate, style?: StudioStyle) => {
    if (template === 'CLIP_OVERLAY') {
      Alert.alert(t('studio.home.clipSoonTitle'), t('studio.home.clipSoonBody'))
      return
    }
    if (base.disabled.includes(template)) {
      Alert.alert(
        t(`studio.template.${template}`),
        t(template === 'GOAL' ? 'studio.home.disabledGoal' : 'studio.home.disabledMotm'),
      )
      return
    }
    router.push({
      pathname: '/studio/editor',
      params: {
        template: templateSlug(template),
        ...(style ? { style: style.toLowerCase() } : null),
        ...(event ? { eventId: event.id } : null),
      },
    } as never)
  }

  const rail = (items: typeof HOME_MATCH_RAIL, label: string, testID: string) => (
    <View style={styles.section}>
      <Text variant="label" accessibilityRole="header">
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
        testID={testID}
      >
        {items.map(({ template, style }) => {
          const clip = template === 'CLIP_OVERLAY'
          const width = clip ? CLIP_WIDTH : THUMB_WIDTH
          const disabled = !clip && base.disabled.includes(template)
          const name = t(`studio.template.${template}`)
          return (
            <Pressable
              key={template}
              onPress={() => open(template, style)}
              accessibilityRole="button"
              accessibilityLabel={clip ? `${name}, ${t('studio.home.soon')}` : name}
              accessibilityState={{ disabled }}
              testID={`studio-template-${templateSlug(template)}${clip ? '-clip' : ''}`}
              style={({ pressed }) => [styles.thumb, { width }, pressed && styles.pressed]}
            >
              <View style={[styles.thumbShadow, { shadowColor: STUDIO_INK }, disabled && styles.dim]}>
                <View style={styles.thumbClip}>
                  <StudioGraphic
                    data={dataFor(template)}
                    template={template}
                    style={style}
                    width={width}
                    height={THUMB_HEIGHT}
                    fontPairing={kit.fontPairing}
                    presentedBy={t('studio.graphic.presentedBy')}
                    accessibilityLabel={t('studio.previewA11y', { template: name })}
                  />
                </View>
              </View>
              <Text variant="footnote" weight="semibold" color="primary" numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-home">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PAGE_TOP, paddingBottom: KIT_HEIGHT + SPACING_XXXL * 2 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ClubScreenHeader
          title={t('studio.title')}
          fallbackHref="/(tabs)/more"
          right={<CreditsChip balance={balance} />}
        />

        {suggestion ? (
          <Pressable
            onPress={() => open(suggestion.template)}
            accessibilityRole="button"
            accessibilityLabel={`${t('studio.home.now')}. ${suggestion.title}. ${suggestion.body}`}
            testID="studio-suggestion"
            style={({ pressed }) => [
              styles.now,
              { backgroundColor: isDark ? c.surfaceRaised : STUDIO_INK },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.nowThumb}>
              <StudioGraphic
                data={suggestion.template === 'HALF_TIME' ? build('HALF_TIME') : base}
                template={suggestion.template}
                style="FLUTLICHT"
                width={NOW_THUMB}
                fontPairing={kit.fontPairing}
                presentedBy={t('studio.graphic.presentedBy')}
                accessibilityLabel={t('studio.previewA11y', {
                  template: t(`studio.template.${suggestion.template}`),
                })}
              />
            </View>
            <View style={styles.nowCopy}>
              <Text variant="caption1" weight="bold" style={styles.nowLabel}>
                {t('studio.home.now')}
              </Text>
              <Text weight="bold" style={styles.nowTitle}>
                {suggestion.title}
              </Text>
              <Text variant="footnote" style={styles.nowBody}>
                {suggestion.body}
              </Text>
            </View>
            <Icon name="chevron.right" size={20} color={STUDIO_ON_WORKSPACE} />
          </Pressable>
        ) : null}

        {rail(HOME_MATCH_RAIL, t('studio.home.matchRail'), 'studio-rail-match')}
        {rail(HOME_CLUB_RAIL, t('studio.home.clubRail'), 'studio-rail-club')}
      </ScrollView>

      <View style={[styles.kitDock, { bottom: Math.max(SPACING_LG, insets.bottom + SPACING_SM) }]}>
        <Pressable
          onPress={() => router.push('/studio/brand-kit' as never)}
          accessibilityRole="button"
          accessibilityLabel={`${t('studio.home.brandKit')}. ${t('studio.home.brandKitSub')}`}
          testID="studio-brand-kit-row"
          style={({ pressed }) => [
            styles.kit,
            { backgroundColor: c.surface, shadowColor: STUDIO_INK },
            pressed && styles.pressed,
          ]}
        >
          <MatchCrest name={studioShortCode(match.club.name)} badgeUrl={kit.crestUrl} size={KIT_CREST} color={kit.colors.primary} />
          <View style={styles.kitCopy}>
            <Text variant="body" weight="bold" color="primary">
              {t('studio.home.brandKit')}
            </Text>
            <Text variant="caption1" weight="regular" color="secondary">
              {t('studio.home.brandKitSub')}
            </Text>
          </View>
          <Icon name="chevron.right" size={18} color={c.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SCREEN_PADDING, gap: PAGE_GAP },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.4 },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_LG,
    padding: SPACING_MD,
    paddingEnd: SPACING_LG,
    borderRadius: NOW_RADIUS,
  },
  nowThumb: { borderRadius: NOW_THUMB_RADIUS, overflow: 'hidden' },
  nowCopy: { flex: 1, gap: SPACING_XS },
  nowLabel: { color: STUDIO_ACCENT, letterSpacing: 0.5 },
  nowTitle: { color: STUDIO_ON_WORKSPACE, fontSize: NOW_TITLE, lineHeight: NOW_TITLE * 1.25 },
  nowBody: { color: STUDIO_WORKSPACE_MUTED },
  section: { gap: SPACING_MD },
  rail: { marginHorizontal: -SCREEN_PADDING },
  railContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_XXS,
    paddingBottom: RAIL_BOTTOM,
    gap: SPACING_MD,
  },
  thumb: { gap: SPACING_SM },
  thumbShadow: {
    borderRadius: RADIUS_MD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  thumbClip: { borderRadius: RADIUS_MD, overflow: 'hidden' },
  kitDock: { position: 'absolute', left: SCREEN_PADDING, right: SCREEN_PADDING },
  kit: {
    minHeight: KIT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: KIT_GAP,
    paddingVertical: KIT_PAD_V,
    paddingHorizontal: KIT_PAD_H,
    borderRadius: KIT_RADIUS,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  kitCopy: { flex: 1, gap: SPACING_XXS },
})
