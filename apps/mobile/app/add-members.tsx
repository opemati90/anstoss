import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { Avatar, Button, Icon, SegmentedControl, Text } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { OnboardingScreen, OnboardingTextField } from '../src/onboarding/ui'
import { goBackOrReplace } from '../src/utils/navigation'
import {
  RADIUS_CARD,
  RADIUS_INPUT,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
  fonts,
  fontSize,
  hairline,
  space,
} from '../src/theme/tokens'

/** GET /clubs/:clubId/teams/:teamId/roster-slots (manager view). */
type RosterSlot = {
  id: string
  fullName: string
  jerseyNumber: number | null
  claimedByUserId: string | null
}

type Mode = 'one' | 'paste'

/** The API accepts at most 40 slots per request (bulkRosterSlotsInputSchema). */
const BATCH = 40

/** "9 Kofi Osei" → { jerseyNumber: 9, fullName: 'Kofi Osei' }. */
export function parseRosterLines(text: string): Array<{ fullName: string; jerseyNumber?: number }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2})[\s.,)-]+(.+)$/)
      const number = match ? Number(match[1]) : NaN
      const name = (match ? match[2] : line).trim().slice(0, 80)
      return number >= 1 && number <= 99 ? { fullName: name, jerseyNumber: number } : { fullName: name }
    })
    .filter((row) => row.fullName.length > 0)
}

/**
 * Kader anlegen (07b, optional, reached from the invite screen): a club admin
 * enters players who have no account yet. Each name becomes a roster slot the
 * player takes over later with the team code. One at a time, or a pasted list.
 */
export default function AddMembersScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const { activeClub, activeTeamId } = useAuth()
  const params = useLocalSearchParams<{ teamId?: string }>()
  const teamId = (Array.isArray(params.teamId) ? params.teamId[0] : params.teamId) ?? activeTeamId
  const clubId = activeClub?.club.id
  const canManage = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const [mode, setMode] = useState<Mode>('one')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [paste, setPaste] = useState('')
  const [slots, setSlots] = useState<RosterSlot[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const base = clubId && teamId ? `/clubs/${clubId}/teams/${teamId}/roster-slots` : null
  const pasted = useMemo(() => parseRosterLines(paste), [paste])

  const load = useCallback(async () => {
    if (!base) return
    setLoadFailed(false)
    try {
      setSlots(await api<RosterSlot[]>(base))
    } catch {
      setLoadFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  async function create(rows: Array<{ fullName: string; jerseyNumber?: number }>) {
    if (!base || rows.length === 0 || saving) return false
    setSaving(true)
    setError(null)
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        await api(base, { method: 'POST', body: { slots: rows.slice(i, i + BATCH) } })
      }
      await load()
      return true
    } catch {
      setError(t('onboardingFlow.addMembers.saveFailed', { defaultValue: 'Could not save. Check the squad size of your plan and try again.' }))
      await load()
      return false
    } finally {
      setSaving(false)
    }
  }

  async function addOne() {
    const fullName = name.trim()
    if (!fullName) return
    const jersey = Number(number)
    const ok = await create([
      jersey >= 1 && jersey <= 99 ? { fullName, jerseyNumber: jersey } : { fullName },
    ])
    if (ok) {
      setName('')
      setNumber('')
    }
  }

  async function addAll() {
    const ok = await create(pasted)
    if (ok) {
      setPaste('')
      setMode('one')
    }
  }

  const done = () => goBackOrReplace(router, '/(tabs)')

  if (!canManage || !base) {
    return (
      <OnboardingScreen
        title={t('onboardingFlow.addMembers.title', { defaultValue: 'Add squad' })}
        subtitle={t('invite.accessDeniedBody')}
        onBack={done}
        testID="add-members-denied"
      />
    )
  }

  return (
    <OnboardingScreen
      title={t('onboardingFlow.addMembers.title', { defaultValue: 'Add squad' })}
      subtitle={t('onboardingFlow.addMembers.subtitle', {
        defaultValue:
          'Enter players yourself. Anyone without an account takes over their profile later with the team code.',
      })}
      onBack={done}
      headerRight={
        <Text variant="caption1" weight="semibold" color="secondary">
          {t('onboardingFlow.addMembers.optional', { defaultValue: 'Optional' })}
        </Text>
      }
      primary={{
        label: t('onboardingFlow.addMembers.done', { defaultValue: 'Done' }),
        onPress: done,
        testID: 'add-members-done',
      }}
      footerNote={
        error ? (
          <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : undefined
      }
      testID="add-members"
    >
      <SegmentedControl<Mode>
        segments={[
          { key: 'one', label: t('onboardingFlow.addMembers.modeOne', { defaultValue: 'One by one' }), testID: 'add-members-mode-one' },
          { key: 'paste', label: t('onboardingFlow.addMembers.modePaste', { defaultValue: 'Paste a list' }), testID: 'add-members-mode-paste' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'one' ? (
        <View style={styles.form}>
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <OnboardingTextField
                label={t('onboardingFlow.addMembers.name', { defaultValue: 'Name' })}
                value={name}
                onChangeText={setName}
                placeholder={t('onboardingFlow.addMembers.namePlaceholder', { defaultValue: 'First and last name' })}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={() => void addOne()}
                testID="add-members-name"
              />
            </View>
            <View style={styles.numberField}>
              <OnboardingTextField
                label={t('onboardingFlow.addMembers.number', { defaultValue: 'No.' })}
                value={number}
                onChangeText={(raw) => setNumber(raw.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.numberInput}
                testID="add-members-number"
              />
            </View>
          </View>
          <Button
            label={t('onboardingFlow.addMembers.add', { defaultValue: 'Add' })}
            variant="bordered"
            size="md"
            fullWidth
            leftIcon={<Icon name="plus" size={18} color={c.textPrimary} />}
            onPress={() => void addOne()}
            disabled={!name.trim()}
            loading={saving}
            testID="add-members-add"
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text variant="caption1" weight="semibold">
            {t('onboardingFlow.addMembers.pasteLabel', { defaultValue: 'One player per line, number in front optional' })}
          </Text>
          <TextInput
            value={paste}
            onChangeText={setPaste}
            multiline
            accessibilityLabel={t('onboardingFlow.addMembers.pasteLabel', {
              defaultValue: 'One player per line, number in front optional',
            })}
            placeholder={t('onboardingFlow.addMembers.pastePlaceholder', { defaultValue: '4 Tom Novak\n10 Mert Yilmaz' })}
            placeholderTextColor={c.textTertiary}
            selectionColor={c.ink}
            style={[
              styles.paste,
              { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.borderStrong },
            ]}
            testID="add-members-paste"
          />
          <Button
            label={t('onboardingFlow.addMembers.addAll', { defaultValue: 'Add {{count}} players', count: pasted.length })}
            variant="bordered"
            size="md"
            fullWidth
            onPress={() => void addAll()}
            disabled={pasted.length === 0}
            loading={saving}
            testID="add-members-add-all"
          />
        </View>
      )}

      <View style={styles.section}>
        <Text variant="label" accessibilityRole="header">
          {t('onboardingFlow.addMembers.count', { defaultValue: 'In the team · {{count}}', count: slots?.length ?? 0 })}
        </Text>
        {slots === null && !loadFailed ? <ActivityIndicator color={c.textTertiary} /> : null}
        {loadFailed ? (
          <Button
            label={t('onboardingFlow.common.retry')}
            variant="bordered"
            size="sm"
            onPress={() => void load()}
          />
        ) : null}
        {slots && slots.length > 0 ? (
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {slots.map((slot, index) => (
              <View
                key={slot.id}
                style={[
                  styles.row,
                  index < slots.length - 1 && {
                    borderBottomWidth: hairline,
                    borderBottomColor: c.borderSubtle,
                  },
                ]}
                accessible
                accessibilityLabel={[
                  slot.fullName,
                  slot.jerseyNumber ? `#${slot.jerseyNumber}` : null,
                  slot.claimedByUserId
                    ? t('onboardingFlow.addMembers.claimed', { defaultValue: 'Has an account' })
                    : t('onboardingFlow.addMembers.unclaimed', { defaultValue: 'No account' }),
                ]
                  .filter(Boolean)
                  .join(', ')}
              >
                <Avatar size={36} fallbackText={slot.fullName} tone="neutral" />
                <View style={styles.rowCopy}>
                  <Text variant="subheadline" weight="semibold" numberOfLines={1}>
                    {slot.fullName}
                  </Text>
                  <Text variant="caption1" color="secondary">
                    {slot.jerseyNumber
                      ? t('onboardingFlow.addMembers.metaNumber', {
                          defaultValue: 'Player · {{number}}',
                          number: slot.jerseyNumber,
                        })
                      : t('onboardingFlow.addMembers.metaPlayer', { defaultValue: 'Player' })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.tag,
                    slot.claimedByUserId
                      ? { backgroundColor: c.surfaceMuted }
                      : { borderWidth: 1, borderColor: c.borderStrong },
                  ]}
                >
                  <Text variant="caption1" weight="bold" color={slot.claimedByUserId ? 'primary' : 'secondary'}>
                    {slot.claimedByUserId
                      ? t('onboardingFlow.addMembers.claimed', { defaultValue: 'Has an account' })
                      : t('onboardingFlow.addMembers.unclaimed', { defaultValue: 'No account' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  form: { gap: SPACING_MD + 2 },
  nameRow: { flexDirection: 'row', gap: SPACING_MD - 2, alignItems: 'flex-start' },
  nameField: { flex: 1, minWidth: 0 },
  numberField: { width: 76 },
  numberInput: { textAlign: 'center', fontFamily: fonts.data },
  paste: {
    minHeight: 132,
    borderWidth: 1,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingTop: SPACING_MD + 2,
    paddingBottom: SPACING_MD + 2,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    textAlignVertical: 'top',
  },
  section: { gap: SPACING_MD - 2, marginTop: space.sm },
  group: { borderRadius: RADIUS_CARD, borderCurve: 'continuous', paddingHorizontal: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 58,
    paddingVertical: SPACING_SM,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  tag: {
    paddingHorizontal: SPACING_SM,
    paddingVertical: space.xs,
    borderRadius: RADIUS_SM,
  },
})
