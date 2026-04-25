// apps/mobile/app/register/club.tsx
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { BadgeUploadPicker } from '../../src/components/BadgeUploadPicker'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const PRESET_COLORS = [
  '#1E3A5F', '#C4372C', '#2D7A3A', '#1A1A18', '#B8860B',
  '#6B3FA0', '#E85D04', '#0077B6', '#800020', '#2F4F4F',
]

export default function ClubBranchScreen() {
  const { draft, setClubCreate } = useOnboardingDraft()
  const c = useClubColors()

  const [name, setName] = useState(draft.clubCreate?.name ?? '')
  const [primaryColor, setPrimaryColor] = useState(draft.clubCreate?.primaryColor ?? PRESET_COLORS[0])
  const [badgeUri, setBadgeUri] = useState<string | null>(draft.clubCreate?.badgeUrl ?? null)
  const [welcomeText, setWelcomeText] = useState(draft.clubCreate?.welcomeText ?? '')
  const [firstTeamName, setFirstTeamName] = useState(draft.clubCreate?.firstTeamName ?? '')

  const canContinue = useMemo(
    () => name.trim().length >= 2 && firstTeamName.trim().length >= 1,
    [name, firstTeamName],
  )

  const handleContinue = () => {
    if (!canContinue) return
    setClubCreate({
      name: name.trim(),
      primaryColor,
      badgeUrl: badgeUri ?? undefined,
      welcomeText: welcomeText.trim() || undefined,
      firstTeamName: firstTeamName.trim(),
    })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Tell us about your club</Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Club name</Text>
            <TextInput
              placeholder="Club name"
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textTertiary}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Badge</Text>
            <BadgeUploadPicker imageUri={badgeUri} onImagePicked={setBadgeUri} accentColor={primaryColor} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Primary color</Text>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setPrimaryColor(color)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pick color ${color}`}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: color,
                      borderWidth: primaryColor === color ? 3 : hairline,
                      borderColor: primaryColor === color ? c.primary : c.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Welcome text (optional)</Text>
            <TextInput
              placeholder="Short welcome message shown on the club home."
              value={welcomeText}
              onChangeText={setWelcomeText}
              multiline
              maxLength={500}
              style={[styles.textarea, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textTertiary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>First team name</Text>
            <TextInput
              placeholder="First team (e.g. Herren 1)"
              value={firstTeamName}
              onChangeText={setFirstTeamName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textTertiary}
              maxLength={80}
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
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: radius.full },
  actions: { marginTop: space.xl },
})
