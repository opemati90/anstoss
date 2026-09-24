import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getAge, type TrialInvite } from '@anstoss/shared'
import { EmptyState } from '../../src/components/EmptyState'
import { ErrorState } from '../../src/components/ErrorState'
import { FormInput } from '../../src/components/FormInput'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Banner, Button, Icon, Screen, SectionGroup, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import {
  hairline,
  RADIUS_INPUT,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
} from '../../src/theme/tokens'
import { paths, wechselApi } from '../../src/features/wechsel/api'
import { DatePickerSheet } from '../../src/features/wechsel/components/DatePickerSheet'
import { CardListSkeleton, ClubBadge } from '../../src/features/wechsel/components/Primitives'
import { apiErrorMessage } from '../../src/features/wechsel/components/Sheets'
import { formatDate, fromIsoDate, toIsoDate } from '../../src/features/wechsel/format'
import { invalidateApi, useApiQuery } from '../../src/features/wechsel/query'

/**
 * Aufnahmeantrag after a Probetraining offer. Short on purpose: contact,
 * address, previous club (for the Freigabe and the Passantrag the club files
 * in DFBnet), SEPA consent for the Beitrag. Under 18 the player names a
 * parent or guardian instead, who consents to the membership and the SEPA
 * direct debit themselves (review fix H4: a child's own tick never counts).
 * No bank details here: the Kassenwart sends the SEPA mandate.
 */
export default function AufnahmeantragScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { trialId } = useLocalSearchParams<{ trialId: string }>()
  const { user } = useAuth()
  const query = useApiQuery<TrialInvite>(trialId ? paths.trial(trialId) : null)
  const invite = query.data

  const [phone, setPhone] = useState('')
  const [nationality, setNationality] = useState('')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [hadClub, setHadClub] = useState(true)
  const [previousClub, setPreviousClub] = useState('')
  const [lastMatch, setLastMatch] = useState<string | null>(null)
  const [sepa, setSepa] = useState(false)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [pickDate, setPickDate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  const birth = user?.dateOfBirth ? new Date(user.dateOfBirth) : null
  const isMinor = birth ? getAge(birth) < 18 : false

  const header = (
    <ModalHeader title={t('aufnahme.title')} fallbackHref="/(tabs)/invites" />
  )

  if (query.isLoading) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <CardListSkeleton rows={3} />
      </Screen>
    )
  }
  if (!invite) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <ErrorState
          message={t('aufnahme.loadError')}
          hint={apiErrorMessage(t, query.error)}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    )
  }
  if (invite.status !== 'OFFERED' || invite.joinRequest) {
    return (
      <Screen header={header} padded={false} contentStyle={styles.content}>
        <EmptyState
          icon={invite.joinRequest ? 'checkmark.seal.fill' : 'info.circle'}
          title={invite.joinRequest ? t('aufnahme.alreadySentTitle') : t('aufnahme.notOpenTitle')}
          description={
            invite.joinRequest
              ? t('aufnahme.alreadySentBody', { club: invite.club.name })
              : t('aufnahme.notOpenBody')
          }
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </Screen>
    )
  }

  const errors = {
    street: street.trim().length < 3 ? t('aufnahme.required') : null,
    postalCode: /^\d{5}$/.test(postalCode) ? null : t('aufnahme.postalCodeInvalid'),
    city: city.trim().length < 2 ? t('aufnahme.required') : null,
    previousClub: hadClub && previousClub.trim().length < 2 ? t('aufnahme.required') : null,
    phone: phone.trim().length > 0 && phone.trim().length < 5 ? t('aufnahme.phoneInvalid') : null,
    guardianEmail: !isMinor
      ? null
      : !EMAIL_RE.test(guardianEmail.trim())
        ? t('aufnahme.guardianEmailInvalid')
        : user?.email && guardianEmail.trim().toLowerCase() === user.email.trim().toLowerCase()
          ? t('aufnahme.guardianEmailOwn')
          : null,
  }
  const valid =
    !errors.street &&
    !errors.postalCode &&
    !errors.city &&
    !errors.previousClub &&
    !errors.phone &&
    !errors.guardianEmail &&
    (isMinor || sepa)
  const show = (message: string | null) => (touched ? message : null)

  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSubmitting(true)
    try {
      // Tells the club the player said yes; the application follows right away.
      await wechselApi.playerAction(invite.id, 'ACCEPT_OFFER').catch(() => undefined)
      await wechselApi.submitAufnahmeantrag(invite.clubId, {
        role: 'PLAYER',
        trialInviteId: invite.id,
        street: street.trim(),
        postalCode,
        city: city.trim(),
        phone: phone.trim() || undefined,
        nationality: nationality.trim() || undefined,
        previousClubName: hadClub ? previousClub.trim() : null,
        lastMatchDate: hadClub ? lastMatch : null,
        ...(isMinor
          ? { guardianEmail: guardianEmail.trim().toLowerCase() }
          : { sepaConsent: true }),
      })
      invalidateApi(paths.myTrials, paths.trial(invite.id))
      Alert.alert(
        t('aufnahme.sentTitle'),
        isMinor
          ? t('aufnahme.sentBodyMinor', { club: invite.club.name })
          : t('aufnahme.sentBody', { club: invite.club.name }),
      )
      router.back()
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen header={header} scroll padded={false} contentStyle={styles.content}>
      <View style={styles.intro}>
        <ClubBadge name={invite.club.name} badgeUrl={invite.club.badgeUrl} color={invite.club.primaryColor} size={48} />
        <View style={styles.flex}>
          <Text variant="title3" color="primary">
            {invite.club.name}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('aufnahme.intro', { team: invite.team.displayName })}
          </Text>
        </View>
      </View>

      <SectionGroup header={t('aufnahme.sectionYou')}>
        <View style={styles.readonly}>
          <Text variant="footnote" color="secondary">
            {t('aufnahme.name')}
          </Text>
          <Text variant="body" color="primary">
            {user?.name}
          </Text>
        </View>
        {birth ? (
          <View style={styles.readonly}>
            <Text variant="footnote" color="secondary">
              {t('aufnahme.birthDate')}
            </Text>
            <Text variant="body" color="primary" tabular>
              {formatDate(birth)}
            </Text>
          </View>
        ) : null}
        <View style={styles.field}>
          <FormInput
            label={t('aufnahme.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={40}
            error={show(errors.phone)}
          />
          <FormInput
            label={t('aufnahme.nationality')}
            value={nationality}
            onChangeText={setNationality}
            placeholder={t('aufnahme.nationalityPlaceholder')}
            maxLength={60}
          />
          <Text variant="footnote" color="secondary">
            {t('aufnahme.nationalityHint')}
          </Text>
        </View>
      </SectionGroup>

      <SectionGroup header={t('aufnahme.sectionAddress')}>
        <View style={styles.field}>
          <FormInput
            label={t('aufnahme.street')}
            value={street}
            onChangeText={setStreet}
            autoComplete="street-address"
            textContentType="streetAddressLine1"
            maxLength={120}
            error={show(errors.street)}
          />
          <View style={styles.row}>
            <View style={styles.plz}>
              <FormInput
                label={t('aufnahme.postalCode')}
                value={postalCode}
                onChangeText={(value) => setPostalCode(value.replace(/\D/g, '').slice(0, 5))}
                keyboardType="number-pad"
                autoComplete="postal-code"
                textContentType="postalCode"
                maxLength={5}
                error={show(errors.postalCode)}
              />
            </View>
            <View style={styles.flex}>
              <FormInput
                label={t('aufnahme.city')}
                value={city}
                onChangeText={setCity}
                textContentType="addressCity"
                maxLength={80}
                error={show(errors.city)}
              />
            </View>
          </View>
        </View>
      </SectionGroup>

      <SectionGroup header={t('aufnahme.sectionClub')} footer={t('aufnahme.clubHint')}>
        <ToggleRow label={t('aufnahme.hadClub')} value={hadClub} onChange={setHadClub} />
        {hadClub ? (
          <View style={styles.field}>
            <FormInput
              label={t('aufnahme.previousClub')}
              value={previousClub}
              onChangeText={setPreviousClub}
              placeholder={t('aufnahme.previousClubPlaceholder')}
              maxLength={120}
              error={show(errors.previousClub)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('aufnahme.lastMatch')}
              onPress={() => setPickDate(true)}
              android_ripple={{ color: c.borderSubtle }}
              style={[styles.dateRow, { borderColor: c.borderDefault, backgroundColor: c.surface }]}
            >
              <View style={styles.flex}>
                <Text variant="footnote" color="secondary">
                  {t('aufnahme.lastMatch')}
                </Text>
                <Text variant="body" color={lastMatch ? 'primary' : 'tertiary'} tabular>
                  {lastMatch ? formatDate(fromIsoDate(lastMatch)) : t('aufnahme.lastMatchUnknown')}
                </Text>
              </View>
              <Icon name="calendar" size="md" color="secondary" />
            </Pressable>
          </View>
        ) : null}
      </SectionGroup>

      {isMinor ? (
        <SectionGroup header={t('aufnahme.sectionParents')} footer={t('aufnahme.sepaHint')}>
          <View style={styles.field}>
            <Text variant="subheadline" color="secondary">
              {t('aufnahme.guardianIntro')}
            </Text>
            <FormInput
              label={t('aufnahme.guardianEmail')}
              value={guardianEmail}
              onChangeText={setGuardianEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={254}
              error={show(errors.guardianEmail)}
            />
          </View>
        </SectionGroup>
      ) : (
        <SectionGroup header={t('aufnahme.sectionFees')}>
          <ToggleRow label={t('aufnahme.sepaConsent')} value={sepa} onChange={setSepa} />
          <View style={styles.field}>
            <Text variant="footnote" color="secondary">
              {t('aufnahme.sepaHint')}
            </Text>
          </View>
        </SectionGroup>
      )}

      {touched && !valid ? (
        <Banner
          tone="warning"
          icon="exclamationmark.triangle"
          title={t('aufnahme.incompleteTitle')}
          description={
            !isMinor && !sepa
              ? t('aufnahme.sepaMissing')
              : isMinor && errors.guardianEmail
                ? t('aufnahme.parentalMissing')
                : t('aufnahme.incompleteBody')
          }
        />
      ) : null}

      <Button
        label={t('aufnahme.submit')}
        onPress={() => void submit()}
        loading={submitting}
        disabled={submitting}
        fullWidth
      />
      <Text variant="footnote" color="tertiary" align="center">
        {t('aufnahme.dfbnetNote')}
      </Text>

      <DatePickerSheet
        visible={pickDate}
        title={t('aufnahme.lastMatch')}
        value={lastMatch ? fromIsoDate(lastMatch) : null}
        maximumDate={new Date()}
        onClose={() => setPickDate(false)}
        onConfirm={(date) => {
          setLastMatch(toIsoDate(date))
          setPickDate(false)
        }}
        onClear={() => {
          setLastMatch(null)
          setPickDate(false)
        }}
      />
    </Screen>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  const c = useClubColors()
  return (
    <View style={styles.toggle}>
      <Text variant="body" color="primary" style={styles.flex}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.borderStrong }}
        accessibilityLabel={label}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING_LG,
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_LG,
    paddingBottom: SPACING_XXL,
  },
  intro: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  flex: { flex: 1, minWidth: 0 },
  readonly: { paddingHorizontal: SPACING_MD, paddingVertical: SPACING_SM, gap: SPACING_XS },
  field: { padding: SPACING_MD, gap: SPACING_MD },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  plz: { flexBasis: 120, flexGrow: 0 },
  toggle: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  dateRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderWidth: hairline,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
})
