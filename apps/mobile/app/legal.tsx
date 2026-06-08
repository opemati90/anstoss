import { Fragment } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { Icon, Screen, Text, type IconName } from '../src/components/ui'
import {
  hairline,
  radius,
  space,
  fonts,
  fontSize,
  lineHeight,
} from '../src/theme/tokens'

type PolicyRow = {
  key: string
  label: string
  icon: IconName
  path: string
}

export default function LegalScreen() {
  const { t } = useTranslation()
  const c = useClubColors()

  const rows: PolicyRow[] = [
    {
      key: 'impressum',
      label: t('more.impressum'),
      icon: 'doc.text',
      path: '/policy/impressum',
    },
    {
      key: 'privacy',
      label: t('more.privacy'),
      icon: 'lock.fill',
      path: '/policy/privacy',
    },
    {
      key: 'terms',
      label: t('more.terms'),
      icon: 'doc.text',
      path: '/policy/terms',
    },
    {
      key: 'cookies',
      label: t('more.cookies', { defaultValue: 'Cookies' }),
      icon: 'doc.text',
      path: '/policy/cookies',
    },
  ]

  return (
    <Screen
      header={
        <ModalHeader
          title={t('more.legal', { defaultValue: 'Legal' })}
          mode="back"
        />
      }
      padded={false}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {rows.map((row, i) => (
            <Fragment key={row.key}>
              {i > 0 ? (
                <View
                  style={[styles.hairline, { backgroundColor: c.borderDefault }]}
                />
              ) : null}
              <Pressable
                onPress={() => router.push(row.path as never)}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { opacity: 0.96 },
                ]}
              >
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: c.surfaceSunken ?? c.background },
                  ]}
                >
                  <Icon name={row.icon} size={16} color={c.textSecondary} />
                </View>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]} numberOfLines={1}>
                  {row.label}
                </Text>
                <Icon name="chevron.right" size={14} color="tertiary" />
              </Pressable>
            </Fragment>
          ))}
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
  },
  card: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  hairline: { height: hairline, marginLeft: 56 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm + 2,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.heading,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
})
