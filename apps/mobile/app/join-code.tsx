import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { Card, Button, Text } from '../src/components/ui'
import { FormInput } from '../src/components/FormInput'
import { FormScreen } from '../src/components/FormScreen'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

export default function JoinCodeScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [code, setCode] = useState('')

  const trimmed = code.trim().toUpperCase()
  const canContinue = useMemo(() => trimmed.length >= 4 && trimmed.length <= 32, [trimmed])

  const handleContinue = () => {
    if (!canContinue) return
    router.replace(`/join/${trimmed}`)
  }

  return (
    <FormScreen header={<ModalHeader title={t('joinCode.title')} />} padded={false} scroll>
      <View style={styles.content}>
        <Text variant="body" color="secondary">{t('joinCode.subtitle')}</Text>

        <Card padding="card" style={{ gap: space.sm, marginTop: space.md }}>
          <FormInput
            label={t('joinCode.placeholder')}
            placeholder={t('joinCode.placeholder')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            style={[styles.input, { backgroundColor: c.background }]}
            testID="join-code-input"
          />
          {code.length > 0 && !canContinue ? (
            <Text variant="footnote" color="error">{t('joinCode.invalid')}</Text>
          ) : null}
        </Card>

        <Button
          label={t('joinCode.continue')}
          variant="filled"
          size="lg"
          fullWidth
          disabled={!canContinue}
          onPress={handleContinue}
          style={{ marginTop: space.lg }}
          testID="join-code-continue"
        />
      </View>
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg },
  input: {
    letterSpacing: 1.2,
  },
})
