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
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { ApiError, api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

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
  const { t, i18n } = useTranslation()
  const { refreshUser } = useAuth()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PRESET_COLORS[0])
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState('Herren')

  const isEnglish = i18n.resolvedLanguage === 'en'

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
      await api('/clubs/setup', {
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
              >
                <Text
                  style={[
                    styles.ageChipText,
                    ageGroup === group.value && { color: '#FFF' },
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
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
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
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 24, paddingTop: 80 },
  title: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  subtitle: {
    fontSize: 16,
    color: neutralColors.textSecondary,
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 24,
  },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: neutralColors.textPrimary },
  sectionLabel: { marginTop: 16 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22 },
  colorSelected: { borderWidth: 3, borderColor: neutralColors.textPrimary },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  ageChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  ageChipText: { fontSize: 14, fontWeight: '500', color: neutralColors.textPrimary },
  button: {
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  backButton: {
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  backButtonText: { fontSize: 16, fontWeight: '500', color: neutralColors.textPrimary },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: neutralColors.border,
  },
})
