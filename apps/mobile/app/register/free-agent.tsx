// apps/mobile/app/register/free-agent.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { PlayerPosition } from '@anstoss/shared'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const POSITIONS: { value: PlayerPosition; label: string }[] = [
  { value: PlayerPosition.GK, label: 'Goalkeeper' },
  { value: PlayerPosition.DEF, label: 'Defender' },
  { value: PlayerPosition.MID, label: 'Midfielder' },
  { value: PlayerPosition.FWD, label: 'Forward' },
]

export default function FreeAgentBranchScreen() {
  const { draft, setFreeAgent } = useOnboardingDraft()
  const c = useClubColors()

  const [selectedPositions, setSelectedPositions] = useState<string[]>(
    draft.freeAgent?.position ?? [],
  )
  const [location, setLocation] = useState(draft.freeAgent?.location ?? '')
  const [experienceYearsText, setExperienceYearsText] = useState(
    draft.freeAgent?.experienceYears != null
      ? String(draft.freeAgent.experienceYears)
      : '',
  )
  const [availableForTrials, setAvailableForTrials] = useState(
    draft.freeAgent?.availableForTrials ?? true,
  )
  const [bio, setBio] = useState(draft.freeAgent?.bio ?? '')

  const togglePosition = (value: PlayerPosition) => {
    setSelectedPositions((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    )
  }

  // Treat empty text as 0 so the field is optional
  const experienceYears =
    experienceYearsText.trim() === ''
      ? 0
      : Number.parseInt(experienceYearsText, 10)

  const canContinue = useMemo(
    () =>
      selectedPositions.length >= 1 &&
      location.trim().length >= 1 &&
      Number.isFinite(experienceYears) &&
      experienceYears >= 0 &&
      experienceYears <= 50,
    [selectedPositions, location, experienceYears],
  )

  const handleContinue = () => {
    if (!canContinue) return
    setFreeAgent({
      position: selectedPositions,
      experienceYears,
      location: location.trim(),
      availableForTrials,
      bio: bio.trim(),
    })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          Your free-agent profile
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Positions (pick one or more)
            </Text>
            <View style={styles.chipRow}>
              {POSITIONS.map((opt) => {
                const selected = selectedPositions.includes(opt.value)
                return (
                  <PressableScale
                    key={opt.value}
                    onPress={() => togglePosition(opt.value)}
                  >
                    <View
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? c.primary : c.border,
                          backgroundColor: selected ? c.primary50 : c.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{ color: selected ? c.primary : c.textPrimary }}
                      >
                        {opt.label}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>City</Text>
            <TextInput
              placeholder="City"
              value={location}
              onChangeText={setLocation}
              style={[
                styles.input,
                { color: c.textPrimary, borderColor: c.border },
              ]}
              placeholderTextColor={c.textTertiary}
              maxLength={120}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Years of experience
            </Text>
            <TextInput
              placeholder="Years of experience"
              value={experienceYearsText}
              onChangeText={(v) =>
                setExperienceYearsText(v.replace(/[^0-9]/g, ''))
              }
              keyboardType="number-pad"
              style={[
                styles.input,
                { color: c.textPrimary, borderColor: c.border },
              ]}
              placeholderTextColor={c.textTertiary}
            />
          </View>

          <View style={[styles.field, styles.toggleRow]}>
            <Text style={[styles.label, { color: c.textPrimary }]}>
              Open to trials
            </Text>
            <Switch
              value={availableForTrials}
              onValueChange={setAvailableForTrials}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Short bio (optional)
            </Text>
            <TextInput
              placeholder="A few lines about yourself."
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={500}
              style={[
                styles.textarea,
                { color: c.textPrimary, borderColor: c.border },
              ]}
              placeholderTextColor={c.textTertiary}
            />
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: { marginTop: space.xl },
})
