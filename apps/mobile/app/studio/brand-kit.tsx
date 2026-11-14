import { useCallback, useRef, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { STUDIO_FONT_PAIRINGS, type StudioFontPairing } from '@anstoss/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useStudioBrandKit } from '../../src/hooks/useStudioBrandKit'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { ClubScreenHeader } from '../../src/components/club/ClubScreenHeader'
import { MatchCrest } from '../../src/components/match/MatchCrest'
import { ErrorState } from '../../src/components/ErrorState'
import { Skeleton } from '../../src/components/Skeleton'
import { Button, Icon, Text } from '../../src/components/ui'
import {
  FONT_FAMILY_BOLD,
  FONT_FAMILY_DISPLAY,
  RADIUS_CARD,
  RADIUS_MD,
  SCREEN_PADDING,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXXL,
} from '../../src/theme/tokens'

const SWATCH_KEYS = ['primary', 'accent', 'dark', 'light'] as const
function fontSample(pairing: StudioFontPairing) {
  if (pairing === 'CLASSIC') return { fontFamily: 'Georgia', fontWeight: '700' as const }
  return { fontFamily: pairing === 'MODERN' ? FONT_FAMILY_BOLD : FONT_FAMILY_DISPLAY }
}

function SponsorLogo({ name, uri }: { name: string; uri: string | null }) {
  const [failed, setFailed] = useState(false)
  return uri && !failed ? (
    <Image
      source={{ uri }}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel={name}
      onError={() => setFailed(true)}
    />
  ) : (
    <Text variant="footnote" weight="bold" color="primary" align="center">
      {name}
    </Text>
  )
}

/** Board 40's logo/colour/font hierarchy, backed by confirmed API writes.
 * AI credits and account connections are omitted until those services exist.
 */
export default function StudioBrandKitScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { activeClub } = useAuth()
  const { kit, loading, saving, ready, error, saveFailed, canEdit, allowed, refresh, save } =
    useStudioBrandKit()
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const lastFocusedRefresh = useRef<typeof refresh | null>(null)
  // The hook already loads on mount/scope change. Revalidate after visiting
  // sponsor/club settings, without making two identical initial requests.
  useFocusEffect(
    useCallback(() => {
      if (lastFocusedRefresh.current === refresh) void refresh()
      lastFocusedRefresh.current = refresh
    }, [refresh]),
  )

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-brand-kit">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACING_MD, paddingBottom: insets.bottom + SPACING_XXXL },
        ]}
        refreshControl={
          allowed ? (
            <RefreshControl
              refreshing={loading && !!kit}
              onRefresh={() => void refresh()}
              tintColor={c.textPrimary}
            />
          ) : undefined
        }
      >
        <ClubScreenHeader title={t('studio.brandKit.title')} fallbackHref="/(tabs)/more" />
        {!allowed ? (
          <ErrorState
            message={t('studio.brandKit.noAccessTitle')}
            hint={t('studio.brandKit.noAccessBody')}
          />
        ) : error ? (
          <View testID="studio-kit-error">
            <ErrorState
              message={t(saveFailed ? 'studio.brandKit.saveFailed' : 'studio.brandKit.loadFailed')}
              hint={t('studio.brandKit.retryHint')}
              onRetry={() => void refresh()}
            />
          </View>
        ) : !kit ? (
          <View
            style={styles.section}
            testID="studio-kit-loading"
            accessibilityLabel={t('common.loading')}
            accessibilityState={{ busy: true }}
          >
            <Skeleton width="35%" height={16} />
            <Skeleton shape="card" height={112} />
            <Skeleton width="35%" height={16} />
            <Skeleton shape="card" height={90} />
            <Skeleton width="35%" height={16} />
            <Skeleton shape="card" height={112} />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text variant="label" accessibilityRole="header">
                {t('studio.brandKit.logos')}
              </Text>
              <View style={styles.tiles}>
                <View style={styles.tileColumn}>
                  <View style={[styles.tile, { backgroundColor: c.surface }]}>
                    <MatchCrest
                      name={activeClub?.club.name ?? ''}
                      badgeUrl={kit.crestUrl}
                      size={48}
                      color={kit.colors.primary}
                    />
                  </View>
                  <Text variant="caption1" weight="semibold" color="secondary">
                    {t('studio.brandKit.crest')}
                  </Text>
                </View>
                {kit.sponsors.map((sponsor) => (
                  <View key={sponsor.id} style={styles.tileColumn}>
                    <View style={[styles.tile, { backgroundColor: c.surface }]}>
                      <SponsorLogo
                        key={sponsor.logoUrl ?? sponsor.id}
                        name={sponsor.name}
                        uri={sponsor.logoUrl}
                      />
                    </View>
                    <Text variant="caption1" weight="semibold" color="secondary">
                      {t('studio.brandKit.sponsor')}
                    </Text>
                  </View>
                ))}
                {isAdmin ? (
                  <View style={styles.tileColumn}>
                    <Pressable
                      onPress={() => router.push('/admin-sponsors')}
                      disabled={!ready}
                      accessibilityRole="button"
                      accessibilityLabel={t('studio.brandKit.manageLogos')}
                      accessibilityState={{ disabled: !ready }}
                      testID="studio-kit-add-logo"
                      style={({ pressed }) => [
                        styles.tile,
                        styles.tileAdd,
                        { borderColor: c.borderStrong },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="plus" size={22} color={c.textSecondary} />
                    </Pressable>
                    <Text variant="caption1" weight="semibold" color="secondary">
                      {t('studio.brandKit.manage')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text variant="label" accessibilityRole="header">
                  {t('studio.brandKit.colors')}
                </Text>
                {isAdmin ? (
                  <Button
                    label={t('studio.brandKit.change')}
                    variant="plain"
                    size="sm"
                    disabled={!ready}
                    accessibilityLabel={t('studio.brandKit.changeColors')}
                    testID="studio-kit-change-colors"
                    onPress={() => router.push('/admin-club-profile')}
                  />
                ) : null}
              </View>
              <View style={styles.tiles}>
                {SWATCH_KEYS.map((key) => (
                  <View key={key} style={styles.swatchColumn}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: kit.colors[key], borderColor: c.borderStrong },
                      ]}
                    />
                    <Text variant="caption1" weight="bold" color="primary">
                      {t(`studio.brandKit.${key}`)}
                    </Text>
                    <Text variant="caption1" color="secondary" tabular selectable>
                      {kit.colors[key].toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text variant="label" accessibilityRole="header">
                {t('studio.brandKit.font')}
              </Text>
              <View
                style={styles.tiles}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('studio.brandKit.font')}
              >
                {STUDIO_FONT_PAIRINGS.map((pairing) => (
                  <Pressable
                    key={pairing}
                    onPress={() => void save({ fontPairing: pairing })}
                    disabled={!canEdit || saving || kit.fontPairing === pairing}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`studio.brandKit.fontOption.${pairing}`)}
                    accessibilityState={{
                      checked: kit.fontPairing === pairing,
                      disabled: !canEdit || saving,
                    }}
                    testID={`studio-kit-font-${pairing.toLowerCase()}`}
                    style={({ pressed }) => [
                      styles.fontTile,
                      {
                        backgroundColor: c.surface,
                        borderColor: kit.fontPairing === pairing ? c.ink : c.surface,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      color="primary"
                      style={[styles.fontSample, fontSample(pairing)]}
                    >
                      3:1
                    </Text>
                    <Text variant="caption1" weight="semibold" color="primary" align="center">
                      {t(`studio.brandKit.fontOption.${pairing}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text
                variant="footnote"
                color="secondary"
                accessibilityLiveRegion="polite"
                testID="studio-kit-status"
              >
                {t(
                  saving
                    ? 'studio.brandKit.saving'
                    : canEdit
                      ? 'studio.brandKit.autoSave'
                      : 'studio.brandKit.readOnly',
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, gap: SPACING_XXXL },
  section: { gap: SPACING_MD },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  tileColumn: {
    flexGrow: 1,
    flexBasis: 76,
    maxWidth: '32%',
    gap: SPACING_XS,
    alignItems: 'center',
  },
  tile: {
    width: '100%',
    minHeight: 96,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: SPACING_SM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileAdd: { borderWidth: 1, borderStyle: 'dashed' },
  logo: { width: '100%', height: 64 },
  swatchColumn: { flexGrow: 1, flexBasis: 72, gap: SPACING_XS },
  swatch: {
    height: 56,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fontTile: {
    flexGrow: 1,
    flexBasis: 88,
    minHeight: 104,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: 2,
    padding: SPACING_SM,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING_SM,
  },
  fontSample: { fontSize: 34, lineHeight: 40 },
  pressed: { opacity: 0.7 },
})
