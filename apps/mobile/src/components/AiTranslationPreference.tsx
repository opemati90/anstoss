import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Switch, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import {
  AI_TRANSLATION_NOTICE_VERSION,
  aiTranslationConsentSchema,
  aiTranslationPreferenceSchema,
  type AiTranslationPreference as Preference,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useClubColors } from '../context/ClubThemeContext'
import { aiTranslationCopy } from '../i18n/aiTranslation'
import type { AppLanguage } from '../i18n'
import { RADIUS_CARD, space } from '../theme/tokens'
import { Button, Text } from './ui'

/** Mounted per authenticated session by LanguageScreen; never persisted locally. */
export function AiTranslationPreference({
  language,
  sessionToken,
}: {
  language: AppLanguage
  sessionToken: string
}) {
  const c = useClubColors()
  const copy = aiTranslationCopy[language]
  const [preference, setPreference] = useState<Preference | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const mounted = useRef(true)
  const writing = useRef(false)
  const sequence = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sequence.current++
    }
  }, [])
  const load = useCallback(async () => {
    if (writing.current) return
    const request = ++sequence.current
    setError(false)
    try {
      const result = aiTranslationPreferenceSchema.parse(
        await api('/me/ai-translation', { headers: { Authorization: `Bearer ${sessionToken}` } }),
      )
      if (mounted.current && request === sequence.current) setPreference(result)
    } catch {
      if (mounted.current && request === sequence.current) setError(true)
    }
  }, [sessionToken])
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const save = async (enabled: boolean) => {
    if (!mounted.current || writing.current) return
    writing.current = true
    sequence.current++
    setBusy(true)
    setError(false)
    try {
      const body = aiTranslationConsentSchema.parse({
        enabled,
        noticeVersion: AI_TRANSLATION_NOTICE_VERSION,
      })
      const result = aiTranslationPreferenceSchema.parse(
        await api('/me/ai-translation', {
          method: 'PUT',
          body,
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
      )
      if (mounted.current) setPreference(result)
    } catch {
      // A timeout may have committed. Do not falsely report the old state.
      if (mounted.current) {
        setPreference(null)
        setError(true)
      }
    } finally {
      writing.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]} testID="ai-translation-preference">
      <View style={styles.row}>
        <Text variant="body" weight="semibold" style={styles.title}>
          {copy.title}
        </Text>
        <Switch
          testID="ai-translation-switch"
          accessibilityLabel={copy.title}
          value={preference?.enabled ?? false}
          disabled={busy || !preference || (!preference.available && !preference.enabled)}
          onValueChange={(enabled) => {
            if (!enabled) {
              void save(false)
              return
            }
            Alert.alert(copy.title, copy.disclosure, [
              { text: copy.cancel, style: 'cancel' },
              {
                text: copy.confirm,
                onPress: () => {
                  void save(true)
                },
              },
            ])
          }}
          trackColor={{ false: c.borderControl, true: c.primary }}
        />
      </View>
      <Text variant="footnote" color="secondary">
        {copy.disclosure}
      </Text>
      {busy ? (
        <Text variant="footnote" accessibilityLiveRegion="polite">
          {copy.saving}
        </Text>
      ) : null}
      {!preference && !error && !busy ? <Text variant="footnote">{copy.loading}</Text> : null}
      {preference && !preference.available ? (
        <Text variant="footnote" color="secondary">
          {copy.unavailable}
        </Text>
      ) : null}
      {error ? (
        <>
          <Text variant="footnote" accessibilityRole="alert">
            {copy.error}
          </Text>
          <Button
            label={copy.retry}
            onPress={() => void load()}
            variant="bordered"
            disabled={busy}
            testID="ai-translation-retry"
          />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS_CARD, borderCurve: 'continuous', padding: space.md, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.md },
  title: { flex: 1, minWidth: 0 },
})
