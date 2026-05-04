import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Screen, Text, Icon } from '../src/components/ui'
import { ModalHeader } from '../src/components/ModalHeader'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  setAppLanguage,
  getAppLanguage,
  type AppLanguage,
} from '../src/i18n'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Choice = {
  value: AppLanguage
  flag: string
  native: string
  english: string
  description: string
}

export default function LanguageScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [current, setCurrent] = useState<AppLanguage>(() => getAppLanguage())

  const choices: Choice[] = [
    {
      value: 'de',
      flag: '🇩🇪',
      native: 'Deutsch',
      english: 'German',
      description: t('more.languageChoiceDescriptionDe', {
        defaultValue: 'Standard für die deutschen Verbände',
      }),
    },
    {
      value: 'en',
      flag: '🇬🇧',
      native: 'English',
      english: 'English',
      description: t('more.languageChoiceDescriptionEn', {
        defaultValue: 'For international squads and parents',
      }),
    },
    {
      value: 'fr',
      flag: '🇫🇷',
      native: 'Français',
      english: 'French',
      description: t('more.languageChoiceDescriptionFr', {
        defaultValue: 'Pour les joueurs francophones',
      }),
    },
    {
      value: 'pt',
      flag: '🇵🇹',
      native: 'Português',
      english: 'Portuguese',
      description: t('more.languageChoiceDescriptionPt', {
        defaultValue: 'Para jogadores lusófonos',
      }),
    },
    {
      value: 'it',
      flag: '🇮🇹',
      native: 'Italiano',
      english: 'Italian',
      description: t('more.languageChoiceDescriptionIt', {
        defaultValue: 'Per i giocatori italofoni',
      }),
    },
  ]

  const handlePick = async (value: AppLanguage) => {
    if (value === current) return
    setCurrent(value)
    await setAppLanguage(value)
    setTimeout(() => router.back(), 180)
  }

  return (
    <Screen
      header={
        <ModalHeader
          title={t('more.language', { defaultValue: 'Language' })}
          mode="back"
        />
      }
      padded={false}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {t('more.languageEyebrow', { defaultValue: 'APP LANGUAGE' })}
        </Text>
        <Text variant="title1" color="primary" weight="semibold" style={styles.heading}>
          {t('more.languageChoiceTitle', { defaultValue: 'Choose your language' })}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.lede}>
          {t('more.languageChoiceBody', {
            defaultValue:
              'Anstoss adapts to the language of your squad. Server replies and notifications follow this choice too.',
          })}
        </Text>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          {choices.map((choice, i) => {
            const active = current === choice.value
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="button"
                accessibilityLabel={`${choice.native} (${choice.english})`}
                accessibilityState={{ selected: active }}
                onPress={() => void handlePick(choice.value)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && {
                    borderTopWidth: hairline,
                    borderTopColor: c.borderDefault,
                  },
                  pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                ]}
              >
                <View style={[styles.flagBubble, { backgroundColor: c.surfaceSunken ?? c.background }]}>
                  <Text style={styles.flag}>{choice.flag}</Text>
                </View>
                <View style={styles.copy}>
                  <Text variant="callout" color="primary" weight="semibold">
                    {choice.native}
                  </Text>
                  <Text variant="caption2" color="secondary">
                    {choice.english} · {choice.description}
                  </Text>
                </View>
                {active ? (
                  <View style={[styles.checkBubble, { backgroundColor: c.primary }]}>
                    <Icon name="checkmark" size={14} color="inverse" />
                  </View>
                ) : (
                  <View style={[styles.checkBubble, styles.checkBubbleEmpty, { borderColor: c.borderStrong }]} />
                )}
              </Pressable>
            )
          })}
        </View>

        <Text variant="caption2" color="secondary" style={styles.hint}>
          {t('more.languageDeviceHint', {
            defaultValue:
              'New installs default to your device language with German fallback.',
          })}
        </Text>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    flexGrow: 1,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  heading: { letterSpacing: -0.3 },
  lede: { marginTop: 6, marginBottom: space.md, lineHeight: 20 },

  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 64,
  },
  flagBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 20 },
  copy: { flex: 1, gap: 2 },
  checkBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubbleEmpty: { borderWidth: hairline, backgroundColor: 'transparent' },

  hint: {
    marginTop: space.md,
    textAlign: 'center',
    lineHeight: 18,
  },
})
