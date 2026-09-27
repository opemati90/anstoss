import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { InjuryAvailabilityStatus } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { FormInput } from '../FormInput'
import { Avatar, BottomSheet, Icon, SegmentedControl, Text } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { DateField } from './DateField'
import { SheetHeader } from './SheetHeader'
import { reportInjury } from './rosterApi'
import { endOfDayIso, type KaderMember } from './squadModel'

export const INJURY_STATUSES: InjuryAvailabilityStatus[] = ['OUT', 'DOUBTFUL', 'DAY_TO_DAY']

export type InjuryDraft = {
  title: string
  status: InjuryAvailabilityStatus
  returnDate: Date | null
}

export const EMPTY_INJURY: InjuryDraft = { title: '', status: 'OUT', returnDate: null }

export function injuryStatusLabelKey(status: InjuryAvailabilityStatus) {
  return status === 'DOUBTFUL'
    ? 'kader.injury.statusDoubtful'
    : status === 'DAY_TO_DAY'
      ? 'kader.injury.statusDayToDay'
      : 'kader.injury.statusOut'
}

/** The three injury fields, shared by InjurySheet and PlayerEditSheet. */
export function InjuryFields({
  draft,
  onChange,
}: {
  draft: InjuryDraft
  onChange: (next: InjuryDraft) => void
}) {
  const { t } = useTranslation()
  const tomorrow = new Date(Date.now() + 86_400_000)
  return (
    <View style={styles.fields}>
      <FormInput
        label={t('kader.injury.titleLabel')}
        value={draft.title}
        onChangeText={(title) => onChange({ ...draft, title })}
        placeholder={t('kader.injury.titlePlaceholder')}
        maxLength={100}
        autoCapitalize="sentences"
        testID="injury-title-input"
      />
      <View style={styles.fieldGroup}>
        <Text variant="subheadline" color="secondary">
          {t('kader.injury.statusLabel')}
        </Text>
        <SegmentedControl<InjuryAvailabilityStatus>
          segments={INJURY_STATUSES.map((status) => ({
            key: status,
            label: t(injuryStatusLabelKey(status)),
          }))}
          value={draft.status}
          onChange={(status) => onChange({ ...draft, status })}
        />
      </View>
      <DateField
        label={t('kader.injury.returnLabel')}
        emptyLabel={t('kader.date.open')}
        value={draft.returnDate}
        minimumDate={tomorrow}
        onChange={(returnDate) => onChange({ ...draft, returnDate })}
      />
    </View>
  )
}

type InjurySheetProps = {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  clubId: string
  teamId: string
  /** Players to pick from (the header "Verletzung melden" entry). */
  players: KaderMember[]
}

/** Report an injury for any squad player. Coach-only entry point. */
export function InjurySheet({ visible, onClose, onSaved, clubId, teamId, players }: InjurySheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [draft, setDraft] = useState<InjuryDraft>(EMPTY_INJURY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setPlayerId(null)
      setDraft(EMPTY_INJURY)
    }
  }, [visible])

  const canSave = Boolean(playerId) && draft.title.trim().length >= 2 && !saving

  const save = async () => {
    if (!playerId || !canSave) return
    setSaving(true)
    try {
      await reportInjury(clubId, teamId, {
        userId: playerId,
        title: draft.title.trim(),
        status: draft.status,
        ...(draft.returnDate ? { expectedReturnAt: endOfDayIso(draft.returnDate) } : {}),
      })
      onSaved()
      onClose()
    } catch {
      Alert.alert(t('kader.errors.title'), t('kader.errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const available = players.filter((player) => player.availability.kind !== 'INJURED')

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={88}>
      <SheetHeader
        title={t('kader.injury.sheetTitle')}
        cancelLabel={t('kader.actions.cancel')}
        onCancel={onClose}
        doneLabel={t('kader.injury.submit')}
        onDone={() => void save()}
        doneDisabled={!canSave}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="subheadline" color="secondary">
          {t('kader.injury.playerLabel')}
        </Text>
        {available.length === 0 ? (
          <Text variant="body" color="secondary">
            {t('kader.injury.noPlayers')}
          </Text>
        ) : (
          <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            {available.map((player, index) => {
              const selected = player.userId === playerId
              return (
                <Pressable
                  key={player.userId}
                  accessibilityRole="radio"
                  accessibilityLabel={player.name}
                  accessibilityState={{ selected }}
                  onPress={() => setPlayerId(player.userId)}
                  android_ripple={{ color: c.borderSubtle }}
                  style={({ pressed }) => [
                    styles.playerRow,
                    index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                    pressed && { backgroundColor: c.surfaceSunken },
                  ]}
                >
                  <Text variant="subheadline" color="tertiary" tabular style={styles.number}>
                    {player.jerseyNumber ?? ''}
                  </Text>
                  <Avatar size="sm" src={player.avatarUrl} fallbackText={player.name} />
                  <Text variant="body" color="primary" numberOfLines={1} style={styles.name}>
                    {player.name}
                  </Text>
                  {selected ? <Icon name="checkmark" size={18} color="tint" /> : null}
                </Pressable>
              )
            })}
          </View>
        )}
        <InjuryFields draft={draft} onChange={setDraft} />
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  fields: { gap: space.md, marginTop: space.md },
  fieldGroup: { gap: space.xs },
  list: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  playerRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  number: { minWidth: 24, textAlign: 'right' },
  name: { flex: 1, minWidth: 0 },
})
