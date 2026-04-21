// apps/mobile/app/register/finalize.tsx
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole, completeOnboardingSchema } from '@anstoss/shared'
import { Screen, Card, Button, Text, Icon } from '../../src/components/ui'
import { InlineError } from '../../src/components/InlineError'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api, ApiError } from '../../src/api/client'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../../src/utils/dateOfBirth'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

export default function FinalizeScreen() {
  const { draft, reset } = useOnboardingDraft()
  const { refreshUser } = useAuth()
  const c = useClubColors()

  const [displayName, setDisplayName] = useState(draft.profile.displayName)
  const [dobText, setDobText] = useState(
    draft.profile.dateOfBirth ? toDisplayDob(draft.profile.dateOfBirth) : '',
  )
  const [photoUrl, setPhotoUrl] = useState<string | null>(draft.profile.photoUrl)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedDob = useMemo(() => parseDateOfBirthInput(dobText), [dobText])
  const canSubmit = displayName.trim().length >= 1 && parsedDob !== null && !submitting

  const handleSubmit = async () => {
    setError(null)
    if (!canSubmit || !parsedDob || !draft.registrationRole) {
      setError('Fill in your display name and date of birth to continue.')
      return
    }

    const profile = {
      displayName: displayName.trim(),
      dateOfBirth: parsedDob.iso,
      ...(photoUrl ? { photoUrl } : {}),
    }

    const payload = buildPayload(draft, profile)
    if (!payload) {
      setError('Something about your details does not match what we expected. Go back and review.')
      return
    }

    const parsed = completeOnboardingSchema.safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please review your details and try again.')
      return
    }

    setSubmitting(true)
    try {
      await api('/me/onboarding', { method: 'POST', body: parsed.data })
      await refreshUser()
      reset()
      router.replace('/')
    } catch (e) {
      if (e instanceof ApiError && e.message) {
        setError(e.message)
      } else {
        setError('We could not finish setup. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>One last thing</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          This is how teammates and coaches will recognize you.
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <PhotoPicker value={photoUrl} onChange={setPhotoUrl} />

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Display name</Text>
            <TextInput
              placeholder="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textTertiary}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Date of birth</Text>
            <TextInput
              placeholder="Date of birth (DD.MM.YYYY)"
              value={dobText}
              onChangeText={(v) => setDobText(formatDateOfBirthInput(v))}
              keyboardType="number-pad"
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textTertiary}
              maxLength={10}
            />
          </View>

          {error ? <InlineError message={error} /> : null}
        </Card>

        <View style={styles.actions}>
          <Button
            label={submitting ? 'Finishing…' : 'Finish'}
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

function PhotoPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (url: string | null) => void
}) {
  const c = useClubColors()
  // MVP: no upload yet — keep profile photo optional per spec.
  // A real upload flow will land in Phase 4 polish via the existing avatar pipeline.
  return (
    <Pressable
      onPress={() => onChange(value ? null : 'https://placehold.co/512.png')}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Remove profile photo' : 'Add profile photo'}
      style={styles.photoStub}
    >
      <View style={[styles.photoCircle, { borderColor: c.border }]}>
        <Icon name={value ? 'xmark' : 'camera.fill'} size="lg" color="textSecondary" />
      </View>
      <Text style={{ color: c.textSecondary, fontFamily: fonts.body }}>
        {value ? 'Remove photo' : 'Add photo (optional)'}
      </Text>
    </Pressable>
  )
}

function toDisplayDob(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

type SubmittedProfile = {
  displayName: string
  dateOfBirth: string
  photoUrl?: string
}

function buildPayload(
  draft: ReturnType<typeof useOnboardingDraft>['draft'],
  profile: SubmittedProfile,
): unknown {
  switch (draft.registrationRole) {
    case RegistrationRole.CLUB_ADMIN:
      if (!draft.clubCreate) return null
      return { registrationRole: 'CLUB_ADMIN', profile, clubCreate: draft.clubCreate }
    case RegistrationRole.COACH:
      if (!draft.join) return null
      return { registrationRole: 'COACH', profile, join: draft.join }
    case RegistrationRole.PLAYER:
      if (!draft.join) return null
      return { registrationRole: 'PLAYER', profile, join: draft.join }
    case RegistrationRole.PARENT:
      if (!draft.parentLink) return null
      return { registrationRole: 'PARENT', profile, parentLink: draft.parentLink }
    case RegistrationRole.FREE_AGENT:
      if (!draft.freeAgent) return null
      return { registrationRole: 'FREE_AGENT', profile, freeAgent: draft.freeAgent }
    default:
      return null
  }
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  photoStub: { alignItems: 'center', gap: space.xs },
  photoCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    borderWidth: hairline * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { marginTop: space.xl },
})
