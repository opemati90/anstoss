import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TrialInvite } from '@anstoss/shared'
import { ApiError } from '../../../api/client'
import { FormInput } from '../../../components/FormInput'
import { BottomSheet, Button, FilterChipRow, Icon, Text } from '../../../components/ui'
import { useClubColors } from '../../../context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../../theme/tokens'
import { paths, type TeamOption, type TrainingOption } from '../api'
import { formatSessionDay, formatTime, POSITIONS, positionLabel, toIsoDate } from '../format'
import { useApiQuery } from '../query'
import { RatingStars } from './Primitives'

const MAX_SESSIONS = 3

/** Title + optional hint at the top of every Wechselbörse sheet. */
function SheetTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sheetTitle}>
      <Text variant="title3" weight="bold" color="primary">
        {title}
      </Text>
      {hint ? (
        <Text variant="subheadline" color="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export function apiErrorMessage(t: (key: string) => string, error: unknown) {
  // Review fixes 2026-09-24: localized copy for the new server-side limits.
  if (error instanceof ApiError && error.status === 429) return t('wechsel.errorTooManyRequests')
  if (error instanceof ApiError && error.status === 409 && /Probetrainings/.test(error.message)) {
    return t('wechsel.errorTrialCap')
  }
  if (error instanceof ApiError && error.status === 400 && /youth team/.test(error.message)) {
    return t('wechsel.errorAgeGroup')
  }
  if (error instanceof ApiError && error.status === 403 && /parents/.test(error.message)) {
    return t('spielerprofil.under16Body')
  }
  if (error instanceof ApiError && error.status === 403) return t('wechsel.errorNoAccess')
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.message) {
    return error.message
  }
  return t('wechsel.errorGeneric')
}

// ─── Trainings picker ─────────────────────────────────────────────────

/**
 * Up to three of the team's upcoming trainings. A Probetraining is always
 * a real session of the team, so the invite carries dates the player can
 * put in their calendar.
 */
export function SessionPicker({
  clubId,
  teamId,
  selected,
  onChange,
}: {
  clubId: string
  teamId: string
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const query = useApiQuery<TrainingOption[]>(paths.teamTrainings(clubId, teamId))
  const trainings = useMemo(
    () =>
      (query.data ?? [])
        .filter((event) => event.type === 'TRAINING' && !event.cancelledAt)
        .filter((event) => new Date(event.date).getTime() > Date.now())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 8),
    [query.data],
  )

  if (query.isLoading) {
    return (
      <Text variant="subheadline" color="secondary">
        {t('wechsel.sessionsLoading')}
      </Text>
    )
  }
  if (query.error && !query.data) {
    return (
      <View style={styles.inlineState}>
        <Text variant="subheadline" color="error">
          {t('wechsel.sessionsError')}
        </Text>
        <Button label={t('common.retry')} variant="plain" size="sm" onPress={() => void query.refetch()} />
      </View>
    )
  }
  if (trainings.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: c.borderDefault }]}>
        <Text variant="subheadline" color="secondary">
          {t('wechsel.sessionsEmpty')}
        </Text>
      </View>
    )
  }

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((value) => value !== id))
    else if (selected.length < MAX_SESSIONS) onChange([...selected, id])
  }

  return (
    <View style={[styles.group, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
      {trainings.map((event, index) => {
        const isSelected = selected.includes(event.id)
        const disabled = !isSelected && selected.length >= MAX_SESSIONS
        return (
          <Pressable
            key={event.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={`${formatSessionDay(event.date)} ${formatTime(event.date)} ${event.title}`}
            disabled={disabled}
            onPress={() => toggle(event.id)}
            android_ripple={{ color: c.borderSubtle }}
            style={({ pressed }) => [
              styles.optionRow,
              index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
              pressed && { backgroundColor: c.surfaceSunken },
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.optionText}>
              <Text variant="body" weight="semibold" color="primary">
                {formatSessionDay(event.date)} · <Text variant="body" tabular>{formatTime(event.date)}</Text>
              </Text>
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {[event.title, event.location].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Icon
              name={isSelected ? 'checkmark.circle.fill' : 'circle'}
              size="lg"
              color={isSelected ? c.primary : c.textTertiary}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

function TeamPicker({
  teams,
  value,
  onChange,
}: {
  teams: TeamOption[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <FilterChipRow
      wrap
      singleSelect
      chips={teams.map((team) => ({ key: team.id, label: team.displayName }))}
      selected={value}
      onToggle={onChange}
    />
  )
}

// ─── Invite (club → player) ───────────────────────────────────────────

export function InviteSheet({
  visible,
  onClose,
  clubId,
  teams,
  playerName,
  initialTeamId,
  lockTeam,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  clubId: string
  teams: TeamOption[]
  playerName: string
  initialTeamId?: string | null
  /** A player's request already names the team. */
  lockTeam?: boolean
  submitting: boolean
  onSubmit: (input: { teamId: string; sessionEventIds: string[]; message?: string }) => void
}) {
  const { t } = useTranslation()
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? teams[0]?.id ?? null)
  const [sessions, setSessions] = useState<string[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (visible) {
      setTeamId(initialTeamId ?? teams[0]?.id ?? null)
      setSessions([])
      setMessage('')
    }
  }, [visible, initialTeamId, teams])

  const canSend = Boolean(teamId) && sessions.length > 0 && !submitting

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={88}>
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <SheetTitle title={t('wechsel.inviteTitle', { name: playerName })} hint={t('wechsel.inviteHint')} />
        {!lockTeam && teams.length > 1 ? (
          <View style={styles.field}>
            <Text variant="subheadline" weight="semibold" color="secondary">
              {t('wechsel.fieldTeam')}
            </Text>
            <TeamPicker
              teams={teams}
              value={teamId}
              onChange={(id) => {
                setTeamId(id)
                setSessions([])
              }}
            />
          </View>
        ) : null}
        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text variant="subheadline" weight="semibold" color="secondary">
              {t('wechsel.fieldSessions')}
            </Text>
            <Text variant="footnote" color="tertiary" tabular>
              {t('wechsel.sessionsCount', { count: sessions.length, max: MAX_SESSIONS })}
            </Text>
          </View>
          {teamId ? (
            <SessionPicker clubId={clubId} teamId={teamId} selected={sessions} onChange={setSessions} />
          ) : null}
        </View>
        <FormInput
          label={t('wechsel.fieldMessage')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('wechsel.inviteMessagePlaceholder')}
          multiline
          maxLength={500}
          style={styles.textarea}
        />
        <Button
          label={t('wechsel.inviteSend')}
          onPress={() =>
            teamId &&
            onSubmit({ teamId, sessionEventIds: sessions, message: message.trim() || undefined })
          }
          disabled={!canSend}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Feedback after a session ─────────────────────────────────────────

export function FeedbackSheet({
  visible,
  onClose,
  invite,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  invite: TrialInvite | null
  submitting: boolean
  onSubmit: (input: { rating: number; feedback?: string; attended: boolean }) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [attended, setAttended] = useState(true)

  useEffect(() => {
    if (visible && invite) {
      setRating(invite.rating ?? null)
      setNote(invite.feedback ?? '')
      setAttended(invite.attended ?? true)
    }
  }, [visible, invite])

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <SheetTitle
          title={t('wechsel.feedbackTitle', { name: invite?.player.name ?? '' })}
          hint={t('wechsel.feedbackHint')}
        />
        <View style={[styles.switchRow, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
          <Text variant="body" color="primary" style={styles.flex}>
            {t('wechsel.feedbackAttended')}
          </Text>
          <Switch
            value={attended}
            onValueChange={setAttended}
            trackColor={{ true: c.primary, false: c.borderStrong }}
            accessibilityLabel={t('wechsel.feedbackAttended')}
          />
        </View>
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('wechsel.feedbackRating')}
          </Text>
          <RatingStars value={rating} onChange={setRating} />
        </View>
        <FormInput
          label={t('wechsel.feedbackNote')}
          value={note}
          onChangeText={setNote}
          placeholder={t('wechsel.feedbackNotePlaceholder')}
          multiline
          maxLength={1000}
          style={styles.textarea}
        />
        <Text variant="footnote" color="tertiary">
          {t('wechsel.feedbackPrivate')}
        </Text>
        <Button
          label={t('common.save')}
          onPress={() =>
            rating && onSubmit({ rating, feedback: note.trim() || undefined, attended })
          }
          disabled={!rating || submitting}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Offer a place / send an Absage ───────────────────────────────────

const REJECT_TEMPLATES = ['full', 'level', 'later'] as const

export function DecisionSheet({
  visible,
  mode,
  onClose,
  invite,
  submitting,
  onSubmit,
}: {
  visible: boolean
  mode: 'offer' | 'reject'
  onClose: () => void
  invite: TrialInvite | null
  submitting: boolean
  onSubmit: (message: string | undefined) => void
}) {
  const { t } = useTranslation()
  const [template, setTemplate] = useState<(typeof REJECT_TEMPLATES)[number]>('full')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!visible) return
    if (mode === 'reject') {
      setTemplate('full')
      setMessage(t('wechsel.rejectTemplate.full'))
    } else {
      setMessage(t('wechsel.offerTemplate', { team: invite?.team.displayName ?? '' }))
    }
  }, [visible, mode, invite, t])

  const isReject = mode === 'reject'
  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <SheetTitle
          title={
            isReject
              ? t('wechsel.rejectTitle', { name: invite?.player.name ?? '' })
              : t('wechsel.offerTitle', { name: invite?.player.name ?? '' })
          }
          hint={isReject ? t('wechsel.rejectHint') : t('wechsel.offerHint')}
        />
        {isReject ? (
          <FilterChipRow
            wrap
            singleSelect
            chips={REJECT_TEMPLATES.map((key) => ({
              key,
              label: t(`wechsel.rejectTemplateLabel.${key}`),
            }))}
            selected={template}
            onToggle={(key) => {
              setTemplate(key)
              setMessage(t(`wechsel.rejectTemplate.${key}`))
            }}
          />
        ) : null}
        <FormInput
          label={t('wechsel.fieldMessage')}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          style={styles.textarea}
        />
        <Button
          label={isReject ? t('wechsel.rejectSend') : t('wechsel.offerSend')}
          variant={isReject ? 'destructive' : 'filled'}
          onPress={() => onSubmit(message.trim() || undefined)}
          disabled={submitting}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Gesuch anlegen ───────────────────────────────────────────────────

const VALIDITY_WEEKS = [2, 4, 8] as const

export function GesuchSheet({
  visible,
  onClose,
  teams,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  teams: TeamOption[]
  submitting: boolean
  onSubmit: (input: {
    teamId: string
    positions: Array<(typeof POSITIONS)[number]>
    note?: string
    expiresAt?: string
  }) => void
}) {
  const { t } = useTranslation()
  const [teamId, setTeamId] = useState<string | null>(teams[0]?.id ?? null)
  const [positions, setPositions] = useState<Array<(typeof POSITIONS)[number]>>([])
  const [note, setNote] = useState('')
  const [weeks, setWeeks] = useState<'2' | '4' | '8' | 'open'>('4')

  useEffect(() => {
    if (visible) {
      setTeamId(teams[0]?.id ?? null)
      setPositions([])
      setNote('')
      setWeeks('4')
    }
  }, [visible, teams])

  const expiresAt =
    weeks === 'open' ? undefined : toIsoDate(new Date(Date.now() + Number(weeks) * 7 * 86_400_000))

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={88}>
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <SheetTitle title={t('wechsel.gesuchNewTitle')} hint={t('wechsel.gesuchNewHint')} />
        {teams.length > 1 ? (
          <View style={styles.field}>
            <Text variant="subheadline" weight="semibold" color="secondary">
              {t('wechsel.fieldTeam')}
            </Text>
            <TeamPicker teams={teams} value={teamId} onChange={setTeamId} />
          </View>
        ) : null}
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('wechsel.fieldPositions')}
          </Text>
          <FilterChipRow
            wrap
            chips={POSITIONS.map((key) => ({ key, label: positionLabel(t, key) ?? key }))}
            selected={positions}
            onToggle={(key) =>
              setPositions((current) =>
                current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
              )
            }
          />
        </View>
        <FormInput
          label={t('wechsel.fieldNote')}
          value={note}
          onChangeText={setNote}
          placeholder={t('wechsel.gesuchNotePlaceholder')}
          multiline
          maxLength={500}
          style={styles.textarea}
        />
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('wechsel.fieldValidUntil')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={[
              ...VALIDITY_WEEKS.map((value) => ({
                key: String(value) as '2' | '4' | '8',
                label: t('wechsel.validWeeks', { count: value }),
              })),
              { key: 'open' as const, label: t('wechsel.validOpen') },
            ]}
            selected={weeks}
            onToggle={setWeeks}
          />
        </View>
        <Button
          label={t('wechsel.gesuchPublish')}
          onPress={() =>
            teamId &&
            onSubmit({ teamId, positions, note: note.trim() || undefined, expiresAt })
          }
          disabled={!teamId || positions.length === 0 || submitting}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Player: ask for a Probetraining ──────────────────────────────────

export function RequestTrialSheet({
  visible,
  onClose,
  clubName,
  teamName,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  clubName: string
  teamName: string
  submitting: boolean
  onSubmit: (message: string | undefined) => void
}) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (visible) setMessage('')
  }, [visible])
  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <SheetTitle
          title={t('entdecken.requestTitle', { club: clubName })}
          hint={t('entdecken.requestHint', { team: teamName })}
        />
        <FormInput
          label={t('entdecken.requestMessage')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('entdecken.requestPlaceholder')}
          multiline
          maxLength={500}
          style={styles.textarea}
        />
        <Button
          label={t('entdecken.requestSend')}
          onPress={() => onSubmit(message.trim() || undefined)}
          disabled={submitting}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  )
}

/** Confirm, then run; used for destructive one-tap actions. */
export function confirmAction(
  title: string,
  body: string,
  confirmLabel: string,
  cancelLabel: string,
  run: () => void,
) {
  Alert.alert(title, body, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: run },
  ])
}

const styles = StyleSheet.create({
  sheetBody: {
    gap: SPACING_LG,
    paddingBottom: SPACING_LG,
  },
  sheetTitle: { gap: SPACING_SM },
  field: { gap: SPACING_SM },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  group: {
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  optionText: { flex: 1, minWidth: 0, gap: SPACING_XS },
  disabled: { opacity: 0.45 },
  emptyBox: {
    padding: SPACING_MD,
    borderWidth: hairline,
    borderStyle: 'dashed',
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  inlineState: { gap: SPACING_XS, alignItems: 'flex-start' },
  textarea: {
    minHeight: 96,
    paddingTop: SPACING_SM,
    textAlignVertical: 'top',
  },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  flex: { flex: 1 },
})
