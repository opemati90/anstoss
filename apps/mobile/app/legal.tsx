import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Screen,
  SectionGroup,
  ListRow,
  SettingsIcon,
  SettingsIconTint,
  type IconName,
} from '../src/components/ui'
import { space } from '../src/theme/tokens'

type PolicyRow = {
  key: string
  label: string
  icon: IconName
  tint: string
  path: string
}

export default function LegalScreen() {
  const { t } = useTranslation()

  const rows: PolicyRow[] = [
    {
      key: 'impressum',
      label: t('more.impressum'),
      icon: 'doc.text',
      tint: SettingsIconTint.gray,
      path: '/policy/impressum',
    },
    {
      key: 'privacy',
      label: t('more.privacy'),
      icon: 'lock.fill',
      tint: SettingsIconTint.blue,
      path: '/policy/privacy',
    },
    {
      key: 'terms',
      label: t('more.terms'),
      icon: 'doc.text',
      tint: SettingsIconTint.gray,
      path: '/policy/terms',
    },
    {
      key: 'cookies',
      label: t('more.cookies', { defaultValue: 'Cookies' }),
      icon: 'doc.text',
      tint: SettingsIconTint.gray,
      path: '/policy/cookies',
    },
  ]

  return (
    <Screen
      header={
        <ModalHeader title={t('more.legal', { defaultValue: 'Legal' })} mode="back" />
      }
      padded={false}
    >
      <View style={styles.content}>
        <SectionGroup>
          {rows.map((row) => (
            <ListRow
              key={row.key}
              left={<SettingsIcon name={row.icon} tint={row.tint} />}
              title={row.label}
              showChevron
              onPress={() => router.push(row.path as never)}
            />
          ))}
        </SectionGroup>
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
})
