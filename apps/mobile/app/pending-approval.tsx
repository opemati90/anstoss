import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut, refreshUser } = useAuth()
  const c = useClubColors()

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View
          style={[
            styles.iconTile,
            { backgroundColor: hexWithAlpha(c.info, 0.12) },
          ]}
        >
          <Icon name="clock.fill" size={72} color="info" />
        </View>
        <Text
          variant="caption2"
          color="info"
          tracking="wide"
          align="center"
          style={styles.eyebrow}
        >
          {t('auth.pendingApprovalEyebrow').toUpperCase()}
        </Text>
        <Text variant="title1" color="primary" align="center" style={styles.title}>
          {t('auth.pendingApprovalTitle')}
        </Text>
        <Text variant="body" color="secondary" align="center" style={styles.body}>
          {t('auth.pendingApprovalBody', {
            email: ageGate?.guardianEmail || t('auth.guardianFallback'),
          })}
        </Text>
        <View style={styles.actions}>
          <Button
            label={t('auth.checkStatus')}
            variant="filled"
            size="lg"
            fullWidth
            onPress={() => void refreshUser()}
          />
          <Button
            label={t('more.signOut')}
            variant="plain"
            size="lg"
            fullWidth
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </Screen>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 120,
    height: 120,
    borderRadius: 32,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  eyebrow: {
    marginBottom: space.xs,
  },
  title: {
    marginBottom: space.sm,
    paddingHorizontal: space.md,
  },
  body: {
    maxWidth: 360,
    paddingHorizontal: space.md,
  },
  actions: {
    marginTop: space.xl,
    alignSelf: 'stretch',
    maxWidth: 360,
    gap: space.sm,
  },
})
