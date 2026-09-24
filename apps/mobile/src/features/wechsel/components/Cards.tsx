import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  nextTrialSession,
  type FreeAgentListItem,
  type PlayerSearch,
  type TrialInvite,
} from '@anstoss/shared'
import { useClubColors } from '../../../context/ClubThemeContext'
import { Avatar, Button, Icon, StatusPill, Text } from '../../../components/ui'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../../theme/tokens'
import {
  formatDate,
  formatSessionDay,
  formatTime,
  leagueLabel,
  playerMeta,
  positionLabel,
  stageOf,
  statusChip,
} from '../format'
import { ClubBadge, RatingStars } from './Primitives'

function Surface({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label?: string }) {
  const c = useClubColors()
  const style = [styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]
  if (!onPress) return <View style={style}>{children}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: c.borderSubtle, foreground: true }}
      style={({ pressed }) => [...style, pressed && { backgroundColor: c.surfaceSunken }]}
    >
      {children}
    </Pressable>
  )
}

function PositionTags({ positions }: { positions: string[] }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.tags}>
      {positions.map((position) => (
        <View key={position} style={[styles.tag, { backgroundColor: c.primary50 }]}>
          <Text variant="footnote" weight="semibold" color={c.primary}>
            {positionLabel(t, position)}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── Club side: one trial in the pipeline ─────────────────────────────

export type TrialCardAction =
  | 'invite'
  | 'reject'
  | 'revoke'
  | 'feedback'
  | 'offer'

export function TrialCard({
  invite,
  onOpen,
  onAction,
  busy,
}: {
  invite: TrialInvite
  onOpen: () => void
  onAction: (action: TrialCardAction) => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const stage = stageOf(invite)
  const chip = statusChip(t, invite)
  const next = nextTrialSession(invite.sessions)
  const meta = [
    playerMeta(t, invite.player),
    leagueLabel(t, invite.player.highestLeague),
  ]
    .filter(Boolean)
    .join(' · ')

  let detail: string | null = null
  if (stage === 'REQUESTED') {
    detail = t('wechsel.cardRequested', { date: formatDate(invite.createdAt) })
  } else if (stage === 'INVITED') {
    detail = t('wechsel.cardInvited', { date: formatDate(invite.expiresAt) })
  } else if (next) {
    detail = t('wechsel.cardNextSession', {
      day: formatSessionDay(next.date),
      time: formatTime(next.date),
    })
  } else if (invite.status === 'OFFERED') {
    detail = invite.joinRequest
      ? t('wechsel.cardApplicationIn')
      : invite.respondedAt
        ? t('wechsel.cardOfferAccepted')
        : t('wechsel.cardOfferOpen')
  } else if (stage === 'DECISION') {
    detail = t('wechsel.cardDecide')
  }

  return (
    <Surface onPress={onOpen} label={`${invite.player.name}, ${chip.label}`}>
      <View style={styles.row}>
        <Avatar size="md" tone="neutral" src={invite.player.avatarUrl} fallbackText={invite.player.name} />
        <View style={styles.flex}>
          <Text variant="headline" color="primary" numberOfLines={1}>
            {invite.player.name}
          </Text>
          {meta ? (
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.wrapLine}>
        <StatusPill label={chip.label} tone={chip.tone} />
        <View style={styles.metaLine}>
          <Icon name="person.2" size="sm" color="tertiary" />
          <Text variant="subheadline" color="secondary" style={styles.shrink}>
            {invite.team.displayName}
            {invite.initiatedBy === 'PLAYER' ? ` · ${t('wechsel.viaGesuch')}` : ''}
          </Text>
        </View>
      </View>
      {detail ? (
        <Text variant="subheadline" color="primary" tabular>
          {detail}
        </Text>
      ) : null}
      {invite.rating ? <RatingStars value={invite.rating} size={16} /> : null}
      <TrialCardActions stage={stage} invite={invite} onAction={onAction} busy={busy} />
    </Surface>
  )
}

export function TrialCardActions({
  stage,
  invite,
  onAction,
  busy,
}: {
  stage: ReturnType<typeof stageOf>
  invite: TrialInvite
  onAction: (action: TrialCardAction) => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  if (stage === 'DONE') return null
  const buttons: Array<{ key: TrialCardAction; label: string; variant: 'filled' | 'bordered' | 'plain' }> = []
  if (stage === 'REQUESTED') {
    buttons.push({ key: 'invite', label: t('wechsel.actionInvite'), variant: 'filled' })
    buttons.push({ key: 'reject', label: t('wechsel.actionReject'), variant: 'plain' })
  } else if (stage === 'INVITED') {
    buttons.push({ key: 'invite', label: t('wechsel.actionReschedule'), variant: 'bordered' })
    buttons.push({ key: 'revoke', label: t('wechsel.actionRevoke'), variant: 'plain' })
  } else if (stage === 'SCHEDULED') {
    buttons.push({ key: 'feedback', label: t('wechsel.actionFeedback'), variant: 'bordered' })
    buttons.push({ key: 'reject', label: t('wechsel.actionReject'), variant: 'plain' })
  } else if (stage === 'DECISION') {
    if (invite.status === 'ACCEPTED') {
      buttons.push({ key: 'offer', label: t('wechsel.actionOffer'), variant: 'filled' })
      buttons.push({ key: 'feedback', label: t('wechsel.actionFeedback'), variant: 'bordered' })
    }
    buttons.push({ key: 'reject', label: t('wechsel.actionReject'), variant: 'plain' })
  }
  if (buttons.length === 0) return null
  return (
    <View style={styles.actions}>
      {buttons.map((button) => (
        <Button
          key={button.key}
          label={button.label}
          variant={button.variant}
          size="sm"
          disabled={busy}
          onPress={() => onAction(button.key)}
          accessibilityLabel={`${button.label}: ${invite.player.name}`}
        />
      ))}
    </View>
  )
}

// ─── Gesuch card (club list + player discovery) ───────────────────────

export function GesuchCard({
  search,
  variant,
  onPrimary,
  onSecondary,
  busy,
}: {
  search: PlayerSearch
  variant: 'club' | 'player'
  onPrimary?: () => void
  onSecondary?: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isOpen = search.status === 'OPEN'
  const teamLine = [search.team.displayName, search.team.leagueName].filter(Boolean).join(' · ')
  const validity = search.expiresAt
    ? t('wechsel.gesuchValidUntil', { date: formatDate(search.expiresAt) })
    : t('wechsel.gesuchNoEnd')

  return (
    <Surface>
      {variant === 'player' ? (
        <View style={styles.row}>
          <ClubBadge name={search.club.name} badgeUrl={search.club.badgeUrl} color={search.club.primaryColor} />
          <View style={styles.flex}>
            <Text variant="headline" color="primary" numberOfLines={1}>
              {search.club.name}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {[teamLine, search.club.city].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="headline" color="primary" numberOfLines={1}>
              {search.team.displayName}
            </Text>
            {search.team.leagueName ? (
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {search.team.leagueName}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      {variant === 'club' ? (
        <StatusPill
          label={t(`wechsel.gesuchStatus.${search.status}`)}
          tone={isOpen ? 'success' : 'neutral'}
        />
      ) : null}
      <Text variant="body" weight="semibold" color="primary">
        {t('wechsel.gesuchSeeks')}
      </Text>
      <PositionTags positions={search.positions} />
      {search.note ? (
        <Text variant="subheadline" color="secondary" numberOfLines={3}>
          {search.note}
        </Text>
      ) : null}
      <View style={[styles.footer, { borderTopColor: c.borderSubtle }]}>
        <Text variant="footnote" color="tertiary" tabular style={styles.flex}>
          {variant === 'club' && typeof search.openTrialCount === 'number'
            ? `${validity} · ${t('wechsel.gesuchTrials', { count: search.openTrialCount })}`
            : validity}
        </Text>
      </View>
      {variant === 'club' ? (
        <View style={styles.actions}>
          {isOpen ? (
            <>
              <Button
                label={t('wechsel.gesuchMarkFilled')}
                variant="bordered"
                size="sm"
                disabled={busy}
                onPress={onPrimary}
              />
              <Button
                label={t('wechsel.gesuchClose')}
                variant="plain"
                size="sm"
                disabled={busy}
                onPress={onSecondary}
              />
            </>
          ) : (
            <Button
              label={t('wechsel.gesuchReopen')}
              variant="plain"
              size="sm"
              disabled={busy}
              onPress={onPrimary}
            />
          )}
        </View>
      ) : search.myTrialInviteId ? (
        <Button
          label={t('entdecken.requestOpen')}
          variant="tinted"
          size="md"
          onPress={onSecondary}
          leftIcon={<Icon name="checkmark.circle.fill" size="sm" color="tint" />}
          fullWidth
        />
      ) : (
        <Button
          label={t('entdecken.requestCta')}
          variant="filled"
          size="md"
          disabled={busy}
          onPress={onPrimary}
          fullWidth
        />
      )}
    </Surface>
  )
}

// ─── Spielersuche row ─────────────────────────────────────────────────

export function PlayerRow({ player, onPress }: { player: FreeAgentListItem; onPress: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const meta = playerMeta(t, player)
  const clubLine = [
    leagueLabel(t, player.highestLeague),
    player.currentClubName ?? t('spielerprofil.noClub'),
  ]
    .filter(Boolean)
    .join(' · ')
  const available =
    player.availableFrom && new Date(player.availableFrom).getTime() > Date.now()
      ? t('spielerprofil.availableFromShort', { date: formatDate(player.availableFrom) })
      : t('spielerprofil.availableNow')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.name}, ${meta}, ${clubLine}, ${available}`}
      onPress={onPress}
      android_ripple={{ color: c.borderSubtle, foreground: true }}
      style={({ pressed }) => [
        styles.playerRow,
        { backgroundColor: pressed ? c.surfaceSunken : c.surface, borderColor: c.borderSubtle },
      ]}
    >
      <Avatar size="md" tone="neutral" src={player.avatarUrl} fallbackText={player.name} />
      <View style={styles.flex}>
        <Text variant="headline" color="primary" numberOfLines={1}>
          {player.name}
        </Text>
        {meta ? (
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {clubLine}
        </Text>
      </View>
      <View style={styles.playerRight}>
        <Text variant="footnote" color="tint" weight="semibold" tabular align="right">
          {available}
        </Text>
        <Icon name="chevron.right" size="sm" color="tertiary" />
      </View>
    </Pressable>
  )
}

// ─── Wechsel checklist ────────────────────────────────────────────────

export function ChecklistRow({
  done,
  title,
  value,
  hint,
  onPress,
  disabled,
}: {
  done: boolean
  title: string
  value?: string | null
  hint?: string | null
  onPress?: () => void
  disabled?: boolean
}) {
  const c = useClubColors()
  const content = (
    <>
      <Icon
        name={done ? 'checkmark.circle.fill' : 'circle'}
        size="lg"
        color={done ? c.success : c.textTertiary}
      />
      <View style={styles.flex}>
        <Text variant="body" color="primary">
          {title}
        </Text>
        {value ? (
          <Text variant="subheadline" weight="semibold" color={done ? 'primary' : 'secondary'} tabular>
            {value}
          </Text>
        ) : null}
        {hint ? (
          <Text variant="footnote" color="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      {onPress && !disabled ? <Icon name="chevron.right" size="sm" color="tertiary" /> : null}
    </>
  )
  if (!onPress || disabled) {
    return <View style={[styles.checkRow, disabled && styles.disabled]}>{content}</View>
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, value, hint].filter(Boolean).join(', ')}
      onPress={onPress}
      android_ripple={{ color: c.borderSubtle }}
      style={({ pressed }) => [styles.checkRow, pressed && { backgroundColor: c.surfaceSunken }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING_LG,
    gap: SPACING_MD,
    overflow: 'hidden',
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  flex: { flex: 1, minWidth: 0 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XS, flexShrink: 1, minWidth: 0 },
  wrapLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING_SM },
  shrink: { flexShrink: 1, minWidth: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_XS },
  tag: {
    paddingHorizontal: SPACING_SM + SPACING_XS,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING_SM,
    borderTopWidth: hairline,
  },
  playerRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  playerRight: { alignItems: 'flex-end', gap: SPACING_XS, flexShrink: 1, maxWidth: '38%' },
  checkRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  disabled: { opacity: 0.5 },
})
