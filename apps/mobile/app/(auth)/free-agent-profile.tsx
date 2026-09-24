import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FreeAgentVisibility } from '@anstoss/shared'
import { api } from '../../src/api/client'
import { FormInput } from '../../src/components/FormInput'
import { Banner, FilterChipRow, Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useAuth } from '../../src/context/AuthContext'
import { clearOnboardingIntent } from '../../src/onboarding/intent'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { onboardingProgress } from '../../src/onboarding/steps'
import {
  hairline,
  RADIUS_CARD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../src/theme/tokens'
import { apiErrorMessage } from '../../src/features/wechsel/components/Sheets'
import { DatePickerSheet } from '../../src/features/wechsel/components/DatePickerSheet'
import {
  ageFromDob,
  formatDate,
  LEAGUE_OPTIONS,
  leagueLabel,
  POSITIONS,
  positionLabel,
  toIsoDate,
} from '../../src/features/wechsel/format'

const FEET = ['LEFT', 'RIGHT', 'BOTH'] as const
const RADII = [10, 25, 50] as const
type Availability = 'now' | 'winter' | 'summer' | 'date'

/** Next 1 January / 1 July: the start of the Winter / Sommer Wechselperiode. */
function nextStart(month: 0 | 6, from = new Date()) {
  const candidate = new Date(from.getFullYear(), month, 1)
  return candidate.getTime() > from.getTime() ? candidate : new Date(from.getFullYear() + 1, month, 1)
}

/**
 * Free-agent onboarding: the few facts a club filters by. Everything else
 * (bio, stations, videos) can wait for the Profil tab.
 */
export default function FreeAgentOnboarding() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const { user, memberships } = useAuth()
  const onExpired = useSessionExpiryHandler()
  // Onboarding path: welcome → code → Wie heißt du? → this (4 of 4).
  const progress = (memberships ?? []).length === 0 ? onboardingProgress('freeAgent', 'freeAgentProfile') : null
  const [error, setError] = useState<string | null>(null)
  // Review fix H2: no free-agent profile under 16; 16–17 are visible to clubs only.
  const age = ageFromDob(user?.dateOfBirth)
  const isUnder16 = age !== null && age < 16
  const isMinor = age !== null && age < 18
  const [position, setPosition] = useState<(typeof POSITIONS)[number] | null>(null)
  const [foot, setFoot] = useState<(typeof FEET)[number] | null>(null)
  const [postalCode, setPostalCode] = useState('')
  const [radius, setRadius] = useState<number>(25)
  const [league, setLeague] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability>('now')
  const [customDate, setCustomDate] = useState<Date | null>(null)
  const [pickDate, setPickDate] = useState(false)
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const winter = useMemo(() => nextStart(0), [])
  const summer = useMemo(() => nextStart(6), [])
  const availableFrom =
    availability === 'winter'
      ? toIsoDate(winter)
      : availability === 'summer'
        ? toIsoDate(summer)
        : availability === 'date' && customDate
          ? toIsoDate(customDate)
          : null

  const plzValid = /^\d{5}$/.test(postalCode)
  const canContinue = Boolean(position) && plzValid && !saving

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      // The role is normally written on the final step; the profile needs it now.
      await api('/me', { method: 'PATCH', body: { registrationRole: 'FREE_AGENT' } })
      await api('/me/free-agent-profile', {
        method: 'POST',
        body: {
          position,
          preferredFoot: foot,
          postalCode,
          searchRadiusKm: radius,
          highestLeague: league,
          availableFrom,
          isOnTransferList: active,
          visibility: active ? FreeAgentVisibility.CLUB_ONLY : FreeAgentVisibility.PRIVATE,
        },
      })
      await clearOnboardingIntent()
      // The entry router sends free agents to their tab bar.
      router.replace('/')
    } catch (err) {
      // Inline, next to the form, instead of a blocking alert.
      if (!onExpired(err)) setError(apiErrorMessage(t, err))
    } finally {
      setSaving(false)
    }
  }

  if (isUnder16) {
    return (
      <WizardStep
        title={t('spielerprofil.under16Title')}
        hint={t('spielerprofil.under16Body')}
        ctaLabel={t('common.back')}
        onCta={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
      >
        <View />
      </WizardStep>
    )
  }

  return (
    <WizardStep
      title={t('spielerprofil.onboardingTitle')}
      hint={t('spielerprofil.onboardingHint')}
      ctaLabel={t('spielerprofil.onboardingCta')}
      onCta={() => void finish()}
      ctaDisabled={!canContinue}
      ctaLoading={saving}
      step={progress ?? undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.fields}
      >
        {error ? (
          <Banner
            tone="error"
            icon="exclamationmark.triangle.fill"
            title={t('common.error')}
            description={error}
            testID="free-agent-error"
          />
        ) : null}
        {isMinor ? (
          <Banner
            tone="info"
            icon="lock.shield"
            title={t('spielerprofil.minorTitle')}
            description={t('spielerprofil.minorBody')}
          />
        ) : null}
        <Field label={t('spielerprofil.fieldPosition')}>
          <FilterChipRow
            wrap
            singleSelect
            chips={POSITIONS.map((key) => ({ key, label: positionLabel(t, key) ?? key }))}
            selected={position}
            onToggle={setPosition}
          />
        </Field>
        <Field label={t('spielerprofil.fieldFoot')}>
          <FilterChipRow
            wrap
            singleSelect
            chips={FEET.map((key) => ({ key, label: t(`spielerprofil.foot.${key}`) }))}
            selected={foot}
            onToggle={setFoot}
          />
        </Field>
        <Field label={t('spielerprofil.sectionArea')} hint={t('spielerprofil.areaHint')}>
          <FormInput
            label={t('spielerprofil.fieldPostalCode')}
            value={postalCode}
            onChangeText={(value) => setPostalCode(value.replace(/\D/g, '').slice(0, 5))}
            keyboardType="number-pad"
            autoComplete="postal-code"
            maxLength={5}
            error={postalCode.length > 0 && !plzValid ? t('spielerprofil.postalCodeInvalid') : null}
          />
          <FilterChipRow
            wrap
            singleSelect
            chips={RADII.map((km) => ({ key: String(km), label: t('wechsel.radiusKm', { km }) }))}
            selected={String(radius)}
            onToggle={(key) => setRadius(Number(key))}
          />
        </Field>
        <Field label={t('spielerprofil.fieldLeague')}>
          <FilterChipRow
            wrap
            singleSelect
            chips={LEAGUE_OPTIONS.map((key) => ({ key: key as string, label: leagueLabel(t, key) ?? key }))}
            selected={league}
            onToggle={setLeague}
          />
        </Field>
        <Field label={t('spielerprofil.fieldAvailableFrom')}>
          <FilterChipRow
            wrap
            singleSelect
            chips={[
              { key: 'now' as const, label: t('spielerprofil.availableNow') },
              {
                key: 'winter' as const,
                label: t('spielerprofil.availableWinter', { date: formatDate(winter) }),
              },
              {
                key: 'summer' as const,
                label: t('spielerprofil.availableSummer', { date: formatDate(summer) }),
              },
              {
                key: 'date' as const,
                label: customDate ? formatDate(customDate) : t('spielerprofil.availablePick'),
              },
            ]}
            selected={availability}
            onToggle={(key) => {
              setAvailability(key)
              if (key === 'date') setPickDate(true)
            }}
          />
        </Field>
        <View style={[styles.toggle, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <View style={styles.flex}>
            <Text variant="body" color="primary">
              {t('spielerprofil.searchActive')}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('spielerprofil.searchActiveHint')}
            </Text>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: c.primary, false: c.borderStrong }}
            accessibilityLabel={t('spielerprofil.searchActive')}
          />
        </View>
      </ScrollView>
      <DatePickerSheet
        visible={pickDate}
        title={t('spielerprofil.fieldAvailableFrom')}
        value={customDate}
        minimumDate={new Date()}
        onClose={() => {
          setPickDate(false)
          if (!customDate) setAvailability('now')
        }}
        onConfirm={(date) => {
          setCustomDate(date)
          setPickDate(false)
        }}
      />
    </WizardStep>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="subheadline" weight="semibold" color="secondary">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="footnote" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fields: { gap: SPACING_LG, paddingBottom: SPACING_LG },
  field: { gap: SPACING_SM },
  flex: { flex: 1, minWidth: 0, gap: SPACING_XS },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    padding: SPACING_MD,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
})
