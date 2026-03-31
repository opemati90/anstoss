import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { createClubSchema, createTeamSchema } from '@anstoss/shared'
import type { AssetPresignResponse } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { ApiError, api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { BadgeUploadPicker } from '../src/components/BadgeUploadPicker'
import { getAppLanguage } from '../src/i18n'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../src/theme/tokens'

const PRESET_COLORS = [
  '#1E3A5F',
  '#C4372C',
  '#2D7A3A',
  '#1A1A18',
  '#B8860B',
  '#6B3FA0',
  '#E85D04',
  '#0077B6',
  '#800020',
  '#2F4F4F',
]

const AGE_GROUPS = [
  { value: 'Herren', de: 'Herren', en: 'Men' },
  { value: 'Frauen', de: 'Frauen', en: 'Women' },
  { value: 'A-Jugend', de: 'A-Jugend', en: 'U19' },
  { value: 'B-Jugend', de: 'B-Jugend', en: 'U17' },
  { value: 'C-Jugend', de: 'C-Jugend', en: 'U15' },
  { value: 'D-Jugend', de: 'D-Jugend', en: 'U13' },
  { value: 'E-Jugend', de: 'E-Jugend', en: 'U11' },
  { value: 'F-Jugend', de: 'F-Jugend', en: 'U9' },
  { value: 'G-Jugend', de: 'G-Jugend', en: 'U7' },
] as const

export default function ClubSetupScreen() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PRESET_COLORS[0])
  const [badgeUri, setBadgeUri] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState('Herren')

  const isEnglish = getAppLanguage() === 'en'

  const handleCreate = async () => {
    const clubValidation = createClubSchema.safeParse({
      name: clubName.trim(),
      primaryColor,
    })
    if (!clubValidation.success) {
      Alert.alert(
        t('club.setupWizard.clubNameRequiredTitle'),
        clubValidation.error.issues[0]?.message ||
          t('club.setupWizard.clubNameRequiredBody'),
      )
      return
    }

    const teamValidation = createTeamSchema.safeParse({
      name: teamName.trim(),
      ageGroup,
    })
    if (!teamValidation.success) {
      Alert.alert(
        t('club.setupWizard.teamNameRequiredTitle'),
        teamValidation.error.issues[0]?.message ||
          t('club.setupWizard.teamNameRequiredBody'),
      )
      return
    }

    setIsLoading(true)
    try {
      const result = await api<{ club: { id: string } }>('/clubs/setup', {
        method: 'POST',
        body: {
          club: {
            name: clubName.trim(),
            primaryColor,
          },
          team: {
            name: teamName.trim(),
            ageGroup,
          },
        },
      })

      if (badgeUri) {
        try {
          const presign = await api<AssetPresignResponse>(
            `/clubs/${result.club.id}/assets/presign`,
            {
              method: 'POST',
              body: {
                filename: 'badge.png',
                contentType: 'image/png',
                kind: 'club_badge',
              },
            },
          )

          if (presign.enabled && presign.uploadUrl && presign.publicUrl) {
            const imageResponse = await fetch(badgeUri)
            const blob = await imageResponse.blob()

            await fetch(presign.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'image/png' },
              body: blob,
            })

            await api(`/clubs/${result.club.id}`, {
              method: 'PATCH',
              body: { badgeUrl: presign.publicUrl },
            })
          }
        } catch {
          // Badge upload is best-effort — club was created successfully
        }
      }

      await refreshUser()
      router.replace('/onboarding')
    } catch (error) {
      const errorMessage =
        error instanceof ApiError && error.message
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : t('errors.server')

      Alert.alert(
        t('common.error'),
        errorMessage,
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.outerContainer}>
      <ModalHeader onClose={() => router.replace('/')} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>
        {step === 1 ? t('club.setupWizard.createTitle') : t('club.setupWizard.teamTitle')}
      </Text>
      <Text style={styles.subtitle}>
        {step === 1
          ? t('club.setupWizard.createSubtitle')
          : t('club.setupWizard.teamSubtitle')}
      </Text>

      {step === 1 ? (
        <View style={styles.form}>
          <Text style={styles.label}>{t('club.clubName')}</Text>
          <TextInput
            style={styles.input}
            value={clubName}
            onChangeText={setClubName}
            placeholder="FC Lichtenberg"
            placeholderTextColor={neutralColors.textTertiary}
          />

          <View style={styles.sectionLabel}>
            <BadgeUploadPicker
              imageUri={badgeUri}
              onImagePicked={setBadgeUri}
              accentColor={primaryColor}
            />
          </View>

          <Text style={[styles.label, styles.sectionLabel]}>{t('club.primaryColor')}</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  primaryColor === color && styles.colorSelected,
                ]}
                onPress={() => setPrimaryColor(color)}
                accessibilityRole="button"
                accessibilityLabel={`${t('club.primaryColor')}: ${color}`}
                accessibilityState={{ selected: primaryColor === color }}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: primaryColor }]}
            onPress={() => {
              if (
                !createClubSchema.safeParse({
                  name: clubName.trim(),
                  primaryColor,
                }).success
              ) {
                Alert.alert(
                  t('club.setupWizard.clubNameRequiredTitle'),
                  t('club.setupWizard.clubNameRequiredBody'),
                )
                return
              }
              setStep(2)
            }}
            accessibilityRole="button"
            accessibilityLabel={t('club.setupWizard.nextButton')}
          >
            <Text style={styles.buttonText}>{t('club.setupWizard.nextButton')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>{t('team.teamName')}</Text>
          <TextInput
            style={styles.input}
            value={teamName}
            onChangeText={setTeamName}
            placeholder={t('club.setupWizard.teamNamePlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />

          <Text style={[styles.label, styles.sectionLabel]}>{t('club.setupWizard.ageGroup')}</Text>
          <View style={styles.ageGrid}>
            {AGE_GROUPS.map((group) => (
              <TouchableOpacity
                key={group.value}
                style={[
                  styles.ageChip,
                  ageGroup === group.value && { backgroundColor: primaryColor },
                ]}
                onPress={() => setAgeGroup(group.value)}
                accessibilityRole="button"
                accessibilityLabel={isEnglish ? group.en : group.de}
                accessibilityState={{ selected: ageGroup === group.value }}
              >
                <Text
                  style={[
                    styles.ageChipText,
                    ageGroup === group.value && { color: neutralColors.textInverse },
                  ]}
                >
                  {isEnglish ? group.en : group.de}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <Text style={styles.backButtonText}>{t('common.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: primaryColor, flex: 1, marginTop: 0 },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={t('club.setupWizard.createButton')}
            >
              {isLoading ? (
                <ActivityIndicator color={neutralColors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('club.setupWizard.createButton')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

        <View style={styles.stepIndicator}>
          <View style={[styles.dot, step >= 1 && { backgroundColor: primaryColor }]} />
          <View style={[styles.dot, step >= 2 && { backgroundColor: primaryColor }]} />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: neutralColors.background },
  container: { flex: 1 },
  content: { padding: space.lg },
  title: { fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textPrimary },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    marginTop: space.sm,
    marginBottom: space.xl,
    lineHeight: 24,
  },
  form: { gap: space.sm },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textPrimary },
  sectionLabel: { marginTop: space.md },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm },
  colorSwatch: { width: 44, height: 44, borderRadius: radius.full },
  colorSelected: { borderWidth: 3, borderColor: neutralColors.textPrimary },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm },
  ageChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  ageChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textPrimary },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textInverse },
  buttonRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  backButton: {
    minHeight: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  backButtonText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textPrimary },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  dot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.sm,
    backgroundColor: neutralColors.border,
  },
  joinExistingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    marginBottom: space.lg,
    minHeight: 48,
  },
  choiceStack: {
    gap: space.sm,
  },
  joinExistingText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
  },
})
