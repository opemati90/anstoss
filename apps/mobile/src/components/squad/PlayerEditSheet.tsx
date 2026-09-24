import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { TeamMemberAbsence } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { FormInput } from '../FormInput'
import { Avatar, BottomSheet, Button, SegmentedControl, Text } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { DateField } from './DateField'
import { formatDayMonth } from './format'
import {
  EMPTY_INJURY,
  InjuryFields,
  injuryStatusLabelKey,
  type InjuryDraft,
} from './InjurySheet'
import { SheetHeader } from './SheetHeader'
import { clearInjury, patchRosterMember, reportInjury, type RosterPatch } from './rosterApi'
import { MEDIC_FEATURE_ENABLED } from './medicFeature'
import { canMessageMember, endOfDayIso, type KaderMember } from './squadModel'

type PlayerEditSheetProps = {
  visible: boolean
  member: KaderMember | null
  clubId: string
  teamId: string
  onClose: () => void
  onSaved: () => void
  onMessage: (member: KaderMember) => void
  /** L2: shirt numbers other squad members already wear → their name. */
  takenNumbers?: Map<number, string>
}

type Activity = 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE'

/**
 * Everything a coach changes about one player, in one place: position,
 * number, Sperre / Urlaub, injury, aktiv / inaktiv. Replaces the old
 * roster workspace where "Mark new" was the primary button on every row.
 */
export function PlayerEditSheet({
  visible,
  member,
  clubId,
  teamId,
  onClose,
  onSaved,
  onMessage,
  takenNumbers,
}: PlayerEditSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [position, setPosition] = useState('')
  const [jersey, setJersey] = useState('')
  const [absence, setAbsence] = useState<TeamMemberAbsence>('NONE')
  const [absenceUntil, setAbsenceUntil] = useState<Date | null>(null)
  const [activity, setActivity] = useState<Activity>('ACTIVE')
  const [injuryOpen, setInjuryOpen] = useState(false)
  const [injury, setInjury] = useState<InjuryDraft>(EMPTY_INJURY)
  const [clearPending, setClearPending] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible || !member) return
    setPosition(member.position ?? '')
    setJersey(member.jerseyNumber != null ? String(member.jerseyNumber) : '')
    // A coach never receives the masked youth value; map it defensively.
    setAbsence(member.absence === 'UNAVAILABLE' ? 'SUSPENDED' : (member.absence ?? 'NONE'))
    setAbsenceUntil(member.absenceUntil ? new Date(member.absenceUntil) : null)
    setActivity(member.operationalStatus)
    setInjuryOpen(false)
    setInjury(EMPTY_INJURY)
    setClearPending(false)
  }, [visible, member])

  if (!member) return null

  const activeInjury = member.availability.kind === 'INJURED' ? member.availability : null
  const jerseyTrimmed = jersey.trim()
  const parsedJersey = jerseyTrimmed ? Number.parseInt(jerseyTrimmed, 10) : null
  const jerseyInvalid =
    parsedJersey != null && (Number.isNaN(parsedJersey) || parsedJersey < 0 || parsedJersey > 999)
  const injuryInvalid = injuryOpen && injury.title.trim().length < 2
  // L2: warn before the server's 409 when the number is already worn.
  const jerseyHolder =
    parsedJersey != null && !jerseyInvalid && parsedJersey !== (member.jerseyNumber ?? null)
      ? (takenNumbers?.get(parsedJersey) ?? null)
      : null

  const buildPatch = (): RosterPatch => {
    const patch: RosterPatch = {}
    const nextPosition = position.trim() || null
    if (nextPosition !== (member.position ?? null)) patch.position = nextPosition
    if (parsedJersey !== (member.jerseyNumber ?? null)) patch.jerseyNumber = parsedJersey
    const nextUntil = absence === 'NONE' || !absenceUntil ? null : endOfDayIso(absenceUntil)
    const prevUntil = member.absenceUntil ?? null
    const untilChanged =
      (nextUntil == null) !== (prevUntil == null) ||
      (nextUntil != null &&
        prevUntil != null &&
        new Date(nextUntil).toDateString() !== new Date(prevUntil).toDateString())
    const prevAbsence = member.absence === 'UNAVAILABLE' ? 'SUSPENDED' : (member.absence ?? 'NONE')
    if (absence !== prevAbsence || untilChanged) {
      patch.absence = absence
      patch.absenceUntil = nextUntil
    }
    if (activity !== member.operationalStatus) patch.operationalStatus = activity
    return patch
  }

  const save = async () => {
    if (jerseyInvalid) {
      Alert.alert(t('kader.errors.title'), t('kader.edit.numberInvalid'))
      return
    }
    setSaving(true)
    try {
      const patch = buildPatch()
      if (Object.keys(patch).length > 0) {
        await patchRosterMember(clubId, teamId, member.userId, patch)
      }
      if (MEDIC_FEATURE_ENABLED && activeInjury && clearPending) {
        await clearInjury(clubId, teamId, activeInjury.injuryId)
      }
      if (MEDIC_FEATURE_ENABLED && !activeInjury && injuryOpen && !injuryInvalid) {
        await reportInjury(clubId, teamId, {
          userId: member.userId,
          title: injury.title.trim(),
          status: injury.status,
          ...(injury.returnDate ? { expectedReturnAt: endOfDayIso(injury.returnDate) } : {}),
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      Alert.alert(
        t('kader.errors.title'),
        err instanceof ApiError && err.status === 409 && err.code === 'JERSEY_NUMBER_TAKEN'
          ? t('kader.edit.numberTakenServer', { number: parsedJersey ?? '' })
          : t('kader.errors.saveFailed'),
      )
    } finally {
      setSaving(false)
    }
  }

  const tomorrow = new Date(Date.now() + 86_400_000)
  // Common position abbreviations in the user's language (TW/IV/ZM/ST,
  // GK/CB/CM/ST, G/DC/MC/BU …); positionLine() understands all of them.
  const suggestions = t('kader.positions.suggestions')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const subtitle = member.operationalStatus === 'INACTIVE'
    ? t('kader.edit.subtitleInactive')
    : member.isNew
      ? t('kader.edit.subtitleNew')
      : member.position || t('kader.lines.none')

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={90}>
      <SheetHeader
        title={t('kader.edit.title')}
        cancelLabel={t('kader.actions.cancel')}
        onCancel={onClose}
        doneLabel={t('kader.actions.save')}
        onDone={() => void save()}
        doneDisabled={saving || jerseyInvalid || injuryInvalid || jerseyHolder != null}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          <Avatar size="md" src={member.avatarUrl} fallbackText={member.name} />
          <View style={styles.identityCopy}>
            <Text variant="headline" weight="semibold" color="primary" numberOfLines={2}>
              {member.name}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {canMessageMember(member) ? (
            <Button
              label={t('kader.edit.message')}
              variant="bordered"
              size="sm"
              onPress={() => {
                onClose()
                onMessage(member)
              }}
              accessibilityLabel={t('kader.edit.messageA11y', { name: member.name })}
            />
          ) : null}
        </View>

        <Section title={t('kader.edit.sectionPosition')}>
          <View style={styles.twoCol}>
            <View style={styles.colWide}>
              <FormInput
                label={t('kader.edit.position')}
                value={position}
                onChangeText={setPosition}
                placeholder={t('kader.edit.positionPlaceholder')}
                maxLength={30}
                autoCapitalize="characters"
                testID="player-edit-position"
              />
            </View>
            <View style={styles.colNarrow}>
              <FormInput
                label={t('kader.edit.number')}
                value={jersey}
                onChangeText={(text) => setJersey(text.replace(/[^0-9]/g, ''))}
                placeholder="–"
                keyboardType="number-pad"
                maxLength={3}
                error={
                  jerseyInvalid
                    ? t('kader.edit.numberInvalid')
                    : jerseyHolder
                      ? t('kader.edit.numberTaken', { number: parsedJersey, name: jerseyHolder })
                      : null
                }
                testID="player-edit-number"
              />
            </View>
          </View>
          <View style={styles.chips}>
            {suggestions.map((suggestion) => {
              const selected = position.trim().toLocaleUpperCase() === suggestion.toLocaleUpperCase()
              return (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={suggestion}
                  accessibilityState={{ selected }}
                  onPress={() => setPosition(suggestion)}
                  hitSlop={4}
                  android_ripple={{ color: c.borderSubtle, borderless: false }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? c.primary : c.surface,
                      borderColor: selected ? c.primary : c.borderDefault,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    weight="semibold"
                    color={selected ? c.onPrimary : 'primary'}
                  >
                    {suggestion}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Section>

        <Section title={t('kader.edit.sectionAvailability')}>
          <SegmentedControl<TeamMemberAbsence>
            segments={[
              { key: 'NONE', label: t('kader.edit.fit') },
              { key: 'SUSPENDED', label: t('kader.status.suspended') },
              { key: 'AWAY', label: t('kader.status.away') },
            ]}
            value={absence}
            onChange={(next) => {
              setAbsence(next)
              if (next === 'NONE') setAbsenceUntil(null)
            }}
          />
          {absence !== 'NONE' ? (
            <DateField
              label={t('kader.edit.until')}
              emptyLabel={t('kader.date.open')}
              value={absenceUntil}
              minimumDate={tomorrow}
              onChange={setAbsenceUntil}
            />
          ) : null}
        </Section>

        {MEDIC_FEATURE_ENABLED ? <Section title={t('kader.edit.sectionInjury')}>
          {activeInjury ? (
            <View style={[styles.injuryCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <View style={styles.identityCopy}>
                <Text variant="body" weight="semibold" color="primary">
                  {activeInjury.title}
                </Text>
                <Text variant="footnote" color="secondary">
                  {[
                    t(injuryStatusLabelKey(activeInjury.status)),
                    activeInjury.until
                      ? t('kader.status.untilDate', { date: formatDayMonth(activeInjury.until, locale) })
                      : activeInjury.untilLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {clearPending ? (
                  <Text variant="footnote" color="success">
                    {t('kader.edit.clearPending')}
                  </Text>
                ) : null}
              </View>
              <Button
                label={clearPending ? t('kader.edit.undo') : t('kader.edit.clearInjury')}
                variant="bordered"
                size="sm"
                onPress={() => setClearPending((prev) => !prev)}
              />
            </View>
          ) : injuryOpen ? (
            <>
              <InjuryFields draft={injury} onChange={setInjury} />
              <Button
                label={t('kader.edit.discardInjury')}
                variant="plain"
                size="sm"
                onPress={() => {
                  setInjuryOpen(false)
                  setInjury(EMPTY_INJURY)
                }}
              />
            </>
          ) : (
            <Button
              label={t('kader.edit.reportInjury')}
              variant="bordered"
              size="md"
              fullWidth
              onPress={() => setInjuryOpen(true)}
            />
          )}
        </Section> : null}

        <Section
          title={t('kader.edit.sectionSquad')}
          footer={
            activity === 'INACTIVE' ? t('kader.edit.inactiveHint') : t('kader.edit.activeHint')
          }
        >
          <SegmentedControl<Activity>
            segments={[
              // "Neu" only while the player still carries it; once promoted
              // it is not offered again.
              ...(member.operationalStatus === 'NEW_PLAYER'
                ? [{ key: 'NEW_PLAYER' as const, label: t('kader.row.new') }]
                : []),
              { key: 'ACTIVE' as const, label: t('kader.edit.active') },
              { key: 'INACTIVE' as const, label: t('kader.edit.inactive') },
            ]}
            value={activity}
            onChange={setActivity}
          />
        </Section>
      </ScrollView>
    </BottomSheet>
  )
}

function Section({
  title,
  footer,
  children,
}: {
  title: string
  footer?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text variant="footnote" weight="semibold" color="secondary">
        {title}
      </Text>
      {children}
      {footer ? (
        <Text variant="footnote" color="tertiary">
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.lg,
  },
  identity: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm + 4,
  },
  identityCopy: { flex: 1, minWidth: 140, gap: space['2xs'] },
  section: { gap: space.sm },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  colWide: { flexGrow: 2, flexBasis: 160 },
  colNarrow: { flexGrow: 1, flexBasis: 96 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  chip: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  injuryCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
})
