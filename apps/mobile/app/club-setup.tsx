import { useState } from 'react'
import { View, Pressable, StyleSheet, Alert } from 'react-native'
import { createClubSchema, createTeamSchema } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router, useLocalSearchParams } from 'expo-router'
import { ApiError, api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { FormInput } from '../src/components/FormInput'
import { getAppLanguage } from '../src/i18n'
import { Screen, Card, Button, Text } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  fontSize,
  fonts,
  lineHeight,
  radius,
  space,
  hairline,
  elevation,
} from '../src/theme/tokens'

const SWATCH_SIZE = 44

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
  const params = useLocalSearchParams<{
    clubName?: string | string[]
    directoryEntryId?: string | string[]
  }>()
  const initialClubName = Array.isArray(params.clubName) ? params.clubName[0] : params.clubName
  const directoryEntryId = Array.isArray(params.directoryEntryId)
    ? params.directoryEntryId[0]
    : params.directoryEntryId
  const c = useClubColors()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [clubName, setClubName] = useState(initialClubName ?? '')
  const [primaryColor, setPrimaryColor] = useState(PRESET_COLORS[0])
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState('Herren')
  const [clubError, setClubError] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)

  const isEnglish = getAppLanguage() === 'en'

  const handleNext = () => {
    if (!directoryEntryId) {
      Alert.alert(
        'Select your official club',
        'Club activation starts from a verified directory result.',
        [{ text: 'Find club', onPress: () => router.replace('/find-club') }],
      )
      return
    }
    const validation = createClubSchema.safeParse({
      name: clubName.trim(),
      primaryColor,
    })
    if (!validation.success) {
      setClubError(
        validation.error.issues[0]?.message || t('club.setupWizard.clubNameRequiredBody'),
      )
      return
    }
    setClubError(null)
    setStep(2)
  }

  const handleCreate = async () => {
    if (isLoading) return

    const clubValidation = createClubSchema.safeParse({
      name: clubName.trim(),
      primaryColor,
    })
    if (!clubValidation.success) {
      setClubError(
        clubValidation.error.issues[0]?.message || t('club.setupWizard.clubNameRequiredBody'),
      )
      setStep(1)
      return
    }

    const teamValidation = createTeamSchema.safeParse({
      name: teamName.trim(),
      ageGroup,
    })
    if (!teamValidation.success) {
      setTeamError(
        teamValidation.error.issues[0]?.message || t('club.setupWizard.teamNameRequiredBody'),
      )
      return
    }

    setIsLoading(true)
    setTeamError(null)
    try {
      if (!directoryEntryId) {
        throw new Error('Select your official club before submitting a claim')
      }
      const result = await api<{ id: string }>('/club-claims/first', {
        method: 'POST',
        body: {
          directoryEntryId,
          teamName: teamName.trim(),
          teamGroupType: ageGroup.includes('Jugend') ? 'YOUTH' : 'SENIOR',
          teamRoles: [],
          primaryColor,
        },
      })
      router.replace({ pathname: '/(auth)/claim-pending', params: { claimId: result.id } })
    } catch (error) {
      const errorMessage =
        error instanceof ApiError && error.message
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : t('errors.server')
      setTeamError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleHeaderClose = () => {
    if (isLoading) return
    if (step === 2) {
      setStep(1)
      return
    }
    router.replace('/')
  }

  return (
    <Screen header={<ModalHeader mode="back" onClose={handleHeaderClose} />} scroll padded={false}>
      <View style={{ padding: space.lg, gap: space.lg }}>
        <View>
          <Text style={[styles.title, { color: c.textPrimary }]}>
            {step === 1 ? t('club.setupWizard.createTitle') : t('club.setupWizard.teamTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {step === 1 ? t('club.setupWizard.createSubtitle') : t('club.setupWizard.teamSubtitle')}
          </Text>
        </View>

        {step === 1 ? (
          <Card padding="card" style={[styles.card, { gap: space.md }]}>
            <FormInput
              label={t('club.clubName')}
              value={clubName}
              onChangeText={(text) => {
                setClubName(text)
                setClubError(null)
              }}
              placeholder={t('club.setupWizard.clubNamePlaceholder')}
              error={clubError}
              style={{ backgroundColor: c.background }}
              testID="club-setup-club-name-input"
            />

            <View style={{ gap: space.sm }}>
              <Text variant="caption1" color="secondary" tracking="wide">
                {t('club.primaryColor').toUpperCase()}
              </Text>
              <View style={styles.colorGrid}>
                {PRESET_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      primaryColor === color && {
                        borderWidth: 3,
                        borderColor: c.textPrimary,
                      },
                    ]}
                    onPress={() => setPrimaryColor(color)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('club.primaryColor')}: ${color}`}
                    accessibilityState={{ selected: primaryColor === color }}
                  />
                ))}
              </View>
            </View>

            <Button
              label={t('club.setupWizard.nextButton')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={handleNext}
              style={{ marginTop: space.sm }}
            />
          </Card>
        ) : (
          <Card padding="card" style={[styles.card, { gap: space.md }]}>
            <FormInput
              label={t('team.teamName')}
              value={teamName}
              onChangeText={(text) => {
                setTeamName(text)
                setTeamError(null)
              }}
              placeholder={t('club.setupWizard.teamNamePlaceholder')}
              error={teamError}
              style={{ backgroundColor: c.background }}
              testID="club-setup-team-name-input"
            />

            <View style={{ gap: space.sm }}>
              <Text variant="caption1" color="secondary" tracking="wide">
                {t('club.setupWizard.ageGroup').toUpperCase()}
              </Text>
              <View style={styles.ageGrid}>
                {AGE_GROUPS.map((group) => {
                  const selected = ageGroup === group.value
                  return (
                    <Pressable
                      key={group.value}
                      style={[
                        styles.ageChip,
                        {
                          backgroundColor: selected ? primaryColor : c.surface,
                          borderColor: selected ? primaryColor : c.borderDefault,
                        },
                      ]}
                      onPress={() => setAgeGroup(group.value)}
                      accessibilityRole="button"
                      accessibilityLabel={isEnglish ? group.en : group.de}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.ageChipText,
                          {
                            color: selected ? c.textInverse : c.textPrimary,
                          },
                        ]}
                      >
                        {isEnglish ? group.en : group.de}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Button
                label={t('common.back')}
                variant="secondary"
                size="lg"
                disabled={isLoading}
                onPress={() => setStep(1)}
              />
              <View style={{ flex: 1 }}>
                <Button
                  label={t('club.setupWizard.createButton')}
                  variant="filled"
                  size="lg"
                  fullWidth
                  loading={isLoading}
                  onPress={handleCreate}
                />
              </View>
            </View>
          </Card>
        )}

        <View style={styles.stepIndicator}>
          <View
            style={[styles.dot, { backgroundColor: step >= 1 ? primaryColor : c.borderDefault }]}
          />
          <View
            style={[styles.dot, { backgroundColor: step >= 2 ? primaryColor : c.borderDefault }]}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    marginTop: space.sm,
    lineHeight: lineHeight.md,
  },
  card: {
    ...elevation.card,
  },
  badgeHero: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  colorSwatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: radius.full,
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  ageChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    minHeight: 44,
    justifyContent: 'center',
  },
  ageChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
  dot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.sm,
  },
})
