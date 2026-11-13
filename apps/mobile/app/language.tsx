import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Icon, IconButton, Text } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import i18n, { APP_LANGUAGES, setAppLanguage, getAppLanguage, type AppLanguage } from '../src/i18n'
import { useOnboardingHero } from '../src/onboarding/WelcomeHero'
import {
  RADIUS_CARD,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_MD,
  SPACING_XXS,
  hairline,
  space,
} from '../src/theme/tokens'

/** Native name (what the speaker looks for) and the English name below it. */
const LANGUAGE_NAMES: Record<AppLanguage, { native: string; english: string }> = {
  de: { native: 'Deutsch', english: 'German' },
  en: { native: 'English', english: 'English' },
  fr: { native: 'Français', english: 'French' },
  it: { native: 'Italiano', english: 'Italian' },
  pt: { native: 'Português', english: 'Portuguese' },
  tr: { native: 'Türkçe', english: 'Turkish' },
}

/**
 * Sprache (2026-11 redesign): radio rows with the language code, a club-green
 * preview card that already speaks the picked language, and "Übernehmen".
 * The app switches only on apply, so the preview is the safe place to look.
 */
export default function LanguageScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { bg: hero, fg: onHero } = useOnboardingHero()
  const insets = useSafeAreaInsets()
  const [current] = useState<AppLanguage>(() => getAppLanguage())
  const [picked, setPicked] = useState<AppLanguage>(current)
  const [applying, setApplying] = useState(false)

  // The preview and the screen chrome read in the picked language.
  const tp = useMemo(() => i18n.getFixedT(picked), [picked])

  const apply = async () => {
    if (picked === current) {
      router.back()
      return
    }
    setApplying(true)
    try {
      await setAppLanguage(picked)
    } finally {
      setApplying(false)
    }
    router.back()
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            variant="outlined"
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
          >
            <Icon name="chevron.left" size={20} color={c.textPrimary} />
          </IconButton>
          <Text variant="title2" accessibilityRole="header" style={styles.title}>
            {tp('more.language', { defaultValue: 'Language' })}
          </Text>
        </View>

        <View
          style={[styles.group, { backgroundColor: c.surface }]}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('more.language', { defaultValue: 'Language' })}
        >
          {APP_LANGUAGES.map((code, index) => {
            const active = picked === code
            const name = LANGUAGE_NAMES[code]
            return (
              <Pressable
                key={code}
                onPress={() => setPicked(code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${name.native} (${name.english})`}
                android_ripple={{ color: c.borderDefault }}
                style={[
                  styles.row,
                  index < APP_LANGUAGES.length - 1 && {
                    borderBottomWidth: hairline,
                    borderBottomColor: c.borderSubtle,
                  },
                ]}
                testID={`language-${code}`}
              >
                <Text variant="data" color="secondary" style={styles.code}>
                  {code.toUpperCase()}
                </Text>
                <View style={styles.rowCopy}>
                  <Text variant="body" weight="semibold">
                    {name.native}
                  </Text>
                  <Text variant="caption1" color="secondary">
                    {name.english}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    active
                      ? { borderWidth: 7, borderColor: c.ink }
                      : { borderWidth: 2, borderColor: c.borderControl },
                  ]}
                />
              </Pressable>
            )
          })}
        </View>

        <View
          style={[styles.preview, { backgroundColor: hero }]}
          accessible
          accessibilityLabel={`${tp('onboardingFlow.language.preview', { defaultValue: 'Preview' })}: ${tp(
            'onboardingFlow.welcome.claim',
            { defaultValue: 'Your club.\nOne kickoff.' },
          )}`}
        >
          <Text variant="label" color={c.accent}>
            {tp('onboardingFlow.language.preview', { defaultValue: 'Preview' })}
          </Text>
          <Text variant="display" color={onHero} style={styles.previewTitle}>
            {tp('onboardingFlow.welcome.claim', { defaultValue: 'Your club.\nOne kickoff.' })}
          </Text>
          <Text variant="caption1" color={c.onHeroMuted}>
            {tp('onboardingFlow.welcome.claimBody', {
              defaultValue:
                'Fixtures, availability, lineups, chat and dues in one place. No more group-chat chaos.',
            })}
          </Text>
          <View style={[styles.previewButton, { backgroundColor: c.accent }]}>
            <Text variant="subheadline" weight="bold" color={c.onAccent}>
              {tp('onboardingFlow.common.continue')}
            </Text>
          </View>
        </View>

        <Text variant="caption1" color="secondary">
          {tp('onboardingFlow.language.note', {
            defaultValue: 'Also applies to notifications and emails.',
          })}
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          label={tp('onboardingFlow.language.apply', { defaultValue: 'Apply' })}
          onPress={() => void apply()}
          loading={applying}
          size="lg"
          fullWidth
          testID="language-apply"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: space.lg,
    gap: SPACING_MD + 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  title: { flex: 1, minWidth: 0 },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    paddingVertical: space.sm,
  },
  code: { width: 30, fontSize: 15, lineHeight: 18 },
  rowCopy: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  radio: { width: 22, height: 22, borderRadius: RADIUS_FULL },
  preview: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: SPACING_MD + 6,
    gap: SPACING_MD - 2,
  },
  previewTitle: { fontSize: 34, lineHeight: 34 },
  previewButton: {
    minHeight: 44,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  footer: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm },
})
