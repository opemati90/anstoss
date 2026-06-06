import { useMemo, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { Card, Button, Text } from '../src/components/ui'
import { FormScreen } from '../src/components/FormScreen'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../src/theme/tokens'

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
          <TextInput
            placeholder={t('joinCode.placeholder')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            style={[styles.input, { borderColor: c.borderDefault, color: c.textPrimary }]}
            placeholderTextColor={c.textTertiary}
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
    height: 52,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    letterSpacing: 1.2,
  },
})
