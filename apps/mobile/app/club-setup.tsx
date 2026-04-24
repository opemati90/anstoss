import { useState } from 'react'
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native'
import { createClubSchema, createTeamSchema } from '@anstoss/shared'
import type { AssetPresignResponse } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { ApiError, api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { InlineError } from '../src/components/InlineError'
import { BadgeUploadPicker } from '../src/components/BadgeUploadPicker'
import { getAppLanguage } from '../src/i18n'
import { Screen, Card, Button, Text} from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, lineHeight, radius, space ,
  hairline} from '../src/theme/tokens'

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
  const c = useClubColors()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PRESET_COLORS[0])
  const [badgeUri, setBadgeUri] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState('Herren')
  const [clubError, setClubError] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)

  const isEnglish = getAppLanguage() === 'en'

  const handleNext = () => {
    const validation = createClubSchema.safeParse({
      name: clubName.trim(),
      primaryColor,
    })
    if (!validation.success) {
      setClubError(
        validation.error.issues[0]?.message ||
          t('club.setupWizard.clubNameRequiredBody'),
      )
      return
    }
    setClubError(null)
    setStep(2)
  }

  const handleCreate = async () => {
    const clubValidation = createClubSchema.safeParse({
      name: clubName.trim(),
      primaryColor,
    })
    if (!clubValidation.success) {
      setClubError(
        clubValidation.error.issues[0]?.message ||
          t('club.setupWizard.clubNameRequiredBody'),
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
          club: { name: clubName.trim(), primaryColor },
          team: { name: teamName.trim(), ageGroup },
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
          Alert.alert(
            t('common.errorTitle'),
            t('club.setupWizard.badgeUploadFailed'),
          )
        }
      }

      await refreshUser(undefined, { preferredClubId: result.club.id })
      router.replace('/onboarding')
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

  return (
    <Screen
      header={
        <ModalHeader
          mode="back"
          onClose={() => {
            if (step === 2) {
              setStep(1)
              return
            }
            router.replace('/')
          }}
        />
      }
      scroll
      padded={false}
    >
      <View style={{ padding: space.lg, gap: space.lg }}>
        <View>
          <Text style={[styles.title, { color: c.textPrimary }]}>
            {step === 1
              ? t('club.setupWizard.createTitle')
              : t('club.setupWizard.teamTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {step === 1
              ? t('club.setupWizard.createSubtitle')
              : t('club.setupWizard.teamSubtitle')}
          </Text>
        </View>

        {step === 1 ? (
          <Card padding="card" style={{ gap: space.md }}>
            <View style={styles.badgeHero}>
              <BadgeUploadPicker
                imageUri={badgeUri}
                onImagePicked={setBadgeUri}
                accentColor={primaryColor}
              />
            </View>

            <View style={{ gap: space.xs }}>
              <Text style={[styles.label, { color: c.textPrimary }]}>
                {t('club.clubName')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.surface,
                    borderColor: clubError ? c.error : c.borderDefault,
                    color: c.textPrimary,
                  },
                ]}
                value={clubName}
                onChangeText={(text) => {
                  setClubName(text)
                  setClubError(null)
                }}
                placeholder="FC Lichtenberg"
                placeholderTextColor={c.textTertiary}
              />
              <InlineError message={clubError} />
            </View>

            <View style={{ gap: space.sm }}>
              <Text style={[styles.label, { color: c.textPrimary }]}>
                {t('club.primaryColor')}
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
          <Card padding="card" style={{ gap: space.md }}>
            <View style={{ gap: space.xs }}>
              <Text style={[styles.label, { color: c.textPrimary }]}>
                {t('team.teamName')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.surface,
                    borderColor: teamError ? c.error : c.borderDefault,
                    color: c.textPrimary,
                  },
                ]}
                value={teamName}
                onChangeText={(text) => {
                  setTeamName(text)
                  setTeamError(null)
                }}
                placeholder={t('club.setupWizard.teamNamePlaceholder')}
                placeholderTextColor={c.textTertiary}
              />
              <InlineError message={teamError} />
            </View>

            <View style={{ gap: space.sm }}>
              <Text style={[styles.label, { color: c.textPrimary }]}>
                {t('club.setupWizard.ageGroup')}
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
            style={[
              styles.dot,
              { backgroundColor: step >= 1 ? primaryColor : c.borderDefault },
            ]}
          />
          <View
            style={[
              styles.dot,
              { backgroundColor: step >= 2 ? primaryColor : c.borderDefault },
            ]}
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
  label: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  input: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
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
    width: 44,
    height: 44,
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
