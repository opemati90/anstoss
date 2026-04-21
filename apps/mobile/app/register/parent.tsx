// apps/mobile/app/register/parent.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

export default function ParentBranchScreen() {
  const { draft, setParentLink } = useOnboardingDraft()
  const c = useClubColors()
  const [approvalCode, setApprovalCode] = useState(draft.parentLink?.approvalInviteCode ?? '')

  const trimmed = approvalCode.trim()
  const canContinue = useMemo(() => trimmed.length >= 4 && trimmed.length <= 32, [trimmed])

  const handleContinue = () => {
    if (!canContinue) return
    setParentLink({ approvalInviteCode: trimmed })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Link to your child</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Ask your child&apos;s coach to send you an approval code. Linking by email comes in a later update.
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.sm }}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Approval code</Text>
          <TextInput
            placeholder="Approval code"
            value={approvalCode}
            onChangeText={setApprovalCode}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
            placeholderTextColor={c.textTertiary}
            maxLength={32}
          />
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
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  actions: { marginTop: space.xl },
})
