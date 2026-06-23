import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Screen, Text, Icon, SectionGroup, ListRow } from '../src/components/ui'
import { ModalHeader } from '../src/components/ModalHeader'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  setAppLanguage,
  getAppLanguage,
  type AppLanguage,
} from '../src/i18n'
import { hairline, radius, space } from '../src/theme/tokens'

type Choice = {
  value: AppLanguage
  flag: string
  native: string
  english: string
}

export default function LanguageScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [current, setCurrent] = useState<AppLanguage>(() => getAppLanguage())

  const choices: Choice[] = [
    { value: 'de', flag: '🇩🇪', native: 'Deutsch', english: 'German' },
    { value: 'en', flag: '🇬🇧', native: 'English', english: 'English' },
    { value: 'fr', flag: '🇫🇷', native: 'Français', english: 'French' },
    { value: 'pt', flag: '🇵🇹', native: 'Português', english: 'Portuguese' },
    { value: 'it', flag: '🇮🇹', native: 'Italiano', english: 'Italian' },
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
        <SectionGroup>
          {choices.map((choice) => {
            const active = current === choice.value
            return (
              <ListRow
                key={choice.value}
                left={
                  <View
                    style={[
                      styles.flagBubble,
                      { backgroundColor: c.surfaceSunken ?? c.background },
                    ]}
                  >
                    <Text style={styles.flag}>{choice.flag}</Text>
                  </View>
                }
                title={choice.native}
                accessibilityLabel={`${choice.native} (${choice.english})`}
                selected={active}
                onPress={() => void handlePick(choice.value)}
                right={
                  active ? (
                    <View style={[styles.checkBubble, { backgroundColor: c.primary }]}>
                      <Icon name="checkmark" size={14} color="inverse" />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.checkBubble,
                        styles.checkBubbleEmpty,
                        { borderColor: c.borderStrong },
                      ]}
                    />
                  )
                }
              />
            )
          })}
        </SectionGroup>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    flexGrow: 1,
  },

  flagBubble: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 17 },
  checkBubble: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubbleEmpty: { borderWidth: hairline, backgroundColor: 'transparent' },
})
