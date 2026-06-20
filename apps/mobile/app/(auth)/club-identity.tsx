/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Icon, Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'
import { onboardingStep } from '../../src/onboarding/steps'

const SWATCHES = [
  '#1E3A5F', // navy
  '#1F5C42', // forest
  '#A8364E', // rose
  '#A8642A', // amber
  '#D50000', // crimson
  '#4A2A8A', // deep purple
  '#0D7A8A', // teal
  '#2E2E36', // charcoal
]

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const BADGE_SIZE = 512

export default function ClubIdentity() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/club-identity'), [markStep])

  const [color, setColor] = useState<string>(state.clubPrimaryColor ?? SWATCHES[0])
  const [customHex, setCustomHex] = useState<string>(
    state.clubPrimaryColor && !SWATCHES.includes(state.clubPrimaryColor)
      ? state.clubPrimaryColor
      : '',
  )
  const [logoUri, setLogoUri] = useState<string | null>(state.clubLogoUri ?? null)
  const [processing, setProcessing] = useState(false)

  const initials = (state.clubName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const ready = HEX_RE.test(color)

  async function handlePickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('common.error'),
        t('onboarding.clubIdentity.permissionDenied', {
          defaultValue: 'Photo access is needed to upload a club badge.',
        }),
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    setProcessing(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: BADGE_SIZE, height: BADGE_SIZE } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.PNG },
      )
      setLogoUri(manipulated.uri)
    } catch {
      Alert.alert(
        t('common.error'),
        t('onboarding.clubIdentity.processingError', {
          defaultValue: 'Could not process that image. Try a different photo.',
        }),
      )
    } finally {
      setProcessing(false)
    }
  }

  function handleSubmit() {
    const finalHex = customHex.trim().length > 0 ? customHex.trim() : color
    if (!HEX_RE.test(finalHex)) return
    update({ clubPrimaryColor: finalHex, clubLogoUri: logoUri ?? null })
    // Skip the in-flow roster builder. Admins get faster onboarding +
    // can add players from the squad management screen post-finalize.
    router.push('/(auth)/done')
  }

  function handlePickSwatch(hex: string) {
    setColor(hex)
    setCustomHex('')
  }

  return (
    <WizardStep
      title={t('onboarding.clubIdentity.title', { defaultValue: 'Club identity' })}
      hint={t('onboarding.clubIdentity.hint', {
        defaultValue: 'Pick your colour and add a badge — your team will see this everywhere.',
      })}
      ctaLabel={t('common.next')}
      onCta={handleSubmit}
      ctaDisabled={!ready}
      step={onboardingStep('clubIdentity')}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.previewWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.clubIdentity.uploadBadge', {
              defaultValue: 'Upload badge',
            })}
            onPress={handlePickLogo}
            disabled={processing}
            style={[
              styles.preview,
              {
                backgroundColor: logoUri ? colors.surface : color,
                borderColor: colors.borderDefault,
              },
            ]}
          >
            {processing ? (
              <ActivityIndicator color={colors.surface} />
            ) : logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.previewImg} />
            ) : (
              <Text allowFontScaling={false} style={[styles.previewInitials, { color: colors.surface }]}>
                {initials || '⚽'}
              </Text>
            )}
            <View style={[styles.editBadge, { backgroundColor: colors.textPrimary }]}>
              <Icon name="pencil" size="sm" color={colors.surface} />
            </View>
          </Pressable>
          <Text style={[styles.previewClub, { color: colors.textPrimary }]}>
            {state.clubName || ''}
          </Text>
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
          {t('onboarding.clubIdentity.colorLabel', { defaultValue: 'Brand colour' })}
        </Text>
        <View style={styles.swatches}>
          {SWATCHES.map((hex) => {
            const isActive = !customHex && color === hex
            return (
              <Pressable
                key={hex}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${hex}`}
                onPress={() => handlePickSwatch(hex)}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: hex,
                    borderColor: isActive ? colors.textPrimary : 'transparent',
                  },
                ]}
              >
                {isActive ? <Icon name="checkmark" size={18} color={colors.surface} /> : null}
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textTertiary, marginTop: space.lg }]}>
          {t('onboarding.clubIdentity.customLabel', { defaultValue: 'Or paste a hex' })}
        </Text>
        <TextInput
          value={customHex}
          onChangeText={(v) => {
            setCustomHex(v)
            if (HEX_RE.test(v.trim())) setColor(v.trim())
          }}
          placeholder="#1E3A5F"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        />
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  previewWrap: { alignItems: 'center', marginBottom: space.lg },
  preview: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImg: { width: '100%', height: '100%' },
  previewInitials: {
    fontFamily: fonts.heading,
    fontSize: 44,
    lineHeight: 54,
    fontWeight: '800',
    letterSpacing: -1,
  },
  editBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClub: {
    marginTop: space.sm,
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
})
