import { useCallback, useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ContributionOverview } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { FormInput } from '../src/components/FormInput'
import { Button, Screen, Text } from '../src/components/ui'
import { space } from '../src/theme/tokens'

// Loose IBAN shape mirrored from the server (contributions.service) so we can
// surface a clear inline error before the PATCH round-trips.
const IBAN_PATTERN = /^[A-Z]{2}[0-9A-Z]{13,32}$/

export default function AdminContributionBankScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [settings, setSettings] = useState<ContributionOverview['settings'] | null>(null)
  const [holder, setHolder] = useState('')
  const [iban, setIban] = useState('')
  const [reference, setReference] = useState('')
  const [ibanError, setIbanError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ContributionOverview>(`/clubs/${clubId}/contributions`)
      setSettings(data.settings)
      setHolder(data.settings.bankAccountHolder ?? '')
      setIban(data.settings.bankIban ?? '')
      setReference(data.settings.bankReference ?? '')
    } catch {
      // stale-while-revalidate; the save still works once settings load
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    if (!clubId || !settings) return

    const normalizedIban = iban.replace(/\s+/g, '').toUpperCase()
    if (normalizedIban && !IBAN_PATTERN.test(normalizedIban)) {
      setIbanError(t('contributions.bankSetup.ibanInvalid', { defaultValue: 'Enter a valid IBAN.' }))
      return
    }
    setIbanError(null)
    setSaving(true)
    try {
      await api(`/clubs/${clubId}/contributions/settings`, {
        method: 'PATCH',
        body: {
          enabled: settings.enabled,
          autoRemindersEnabled: settings.autoRemindersEnabled,
          defaultCurrency: settings.defaultCurrency,
          bankAccountHolder: holder.trim() || null,
          bankIban: normalizedIban || null,
          bankReference: reference.trim() || null,
        },
      })
      router.back()
    } catch (e) {
      const message =
        e instanceof ApiError && e.status === 400
          ? t('contributions.bankSetup.ibanInvalid', { defaultValue: 'Enter a valid IBAN.' })
          : t('contributions.settingsError', { defaultValue: 'Could not save. Try again.' })
      Alert.alert(t('common.errorTitle', { defaultValue: 'Something went wrong' }), message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      header={
        <ModalHeader
          title={t('contributions.bankSetup.screenTitle', { defaultValue: 'Bank transfer' })}
          mode="back"
        />
      }
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="footnote" color="secondary" style={styles.intro}>
            {t('contributions.bankSetup.intro', {
              defaultValue:
                'Members see these details on their contributions screen and pay by transfer. You confirm each payment yourself once it lands.',
            })}
          </Text>

          <FormInput
            label={t('contributions.bankSetup.holderLabel', { defaultValue: 'Account holder' })}
            value={holder}
            onChangeText={setHolder}
            placeholder={t('contributions.bankSetup.holderPlaceholder', {
              defaultValue: 'e.g. SV Albatros e.V.',
            })}
            autoCapitalize="words"
            editable={!loading}
          />

          <FormInput
            label={t('contributions.bankSetup.ibanLabel', { defaultValue: 'IBAN' })}
            value={iban}
            onChangeText={(v) => {
              setIban(v)
              if (ibanError) setIbanError(null)
            }}
            placeholder="DE00 0000 0000 0000 0000 00"
            autoCapitalize="characters"
            autoCorrect={false}
            error={ibanError}
            editable={!loading}
          />

          <FormInput
            label={t('contributions.bankSetup.referenceLabel', { defaultValue: 'Reference (optional)' })}
            value={reference}
            onChangeText={setReference}
            placeholder={t('contributions.bankSetup.referencePlaceholder', {
              defaultValue: 'e.g. your name + plan',
            })}
            editable={!loading}
          />

          <View style={styles.saveWrap}>
            <Button
              label={t('common.save', { defaultValue: 'Save' })}
              variant="filled"
              size="md"
              fullWidth
              onPress={handleSave}
              disabled={saving || loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  intro: {
    marginBottom: space['2xs'],
  },
  saveWrap: {
    marginTop: space.sm,
  },
})
