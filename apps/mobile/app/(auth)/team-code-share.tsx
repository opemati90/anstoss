import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function TeamCodeShare() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!state.clubId || !state.teamId) return
      const r = await api<{ joinCode: string }>(
        `/clubs/${state.clubId}/teams/${state.teamId}/join-code`,
        { method: 'POST' },
      )
      if (!cancelled) setCode(r.joinCode)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [state.clubId, state.teamId])

  async function handleCopy() {
    if (!code) return
    await Clipboard.setStringAsync(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <WizardStep
      title={t('onboarding.teamCodeShare.title')}
      hint={t('onboarding.teamCodeShare.hint')}
      ctaLabel={t('onboarding.teamCodeShare.cta')}
      onCta={() => router.push('/(auth)/done')}
      ctaDisabled={!code}
    >
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.code, { color: colors.textPrimary }]}>{code ?? '·····'}</Text>
        <Pressable onPress={handleCopy} disabled={!code}>
          <Text style={[styles.copy, { color: colors.primary }]}>
            {copied ? t('onboarding.teamCodeShare.copied') : t('onboarding.teamCodeShare.copy')}
          </Text>
        </Pressable>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.xl,
    alignItems: 'center',
    gap: space.md,
  },
  code: { fontFamily: fonts.data, fontSize: 48, fontWeight: '800', letterSpacing: 8 },
  copy: { fontFamily: fonts.body, fontSize: fontSize.md, fontWeight: '700' },
})
