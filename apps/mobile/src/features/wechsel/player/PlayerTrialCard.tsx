import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { nextTrialSession, type TrialInvite, type TrialSession } from '@anstoss/shared'
import { Button, Icon, StatusPill, Text } from '../../../components/ui'
import { useClubColors } from '../../../context/ClubThemeContext'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../../theme/tokens'
import {
  formatDate,
  formatLongDay,
  formatSessionDay,
  formatTime,
  stageOf,
  statusChip,
} from '../format'
import { ClubBadge } from '../components/Primitives'

export type PlayerTrialAction = 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'DECLINE_OFFER'

export function openInMaps(location: string) {
  const query = encodeURIComponent(location)
  const url =
    Platform.OS === 'ios' ? `http://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`
  void Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
  )
}

/** The big "next session" block: day, time, place, map. */
export function NextSessionBlock({ session }: { session: TrialSession }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={[styles.nextBlock, { backgroundColor: c.primary50 }]}>
      <Text variant="footnote" weight="semibold" color={c.primary}>
        {t('probetraining.nextSession')}
      </Text>
      <Text variant="title2" color="primary">
        {formatLongDay(session.date)}
      </Text>
      <Text variant="title3" color="primary" tabular>
        {t('probetraining.sessionTime', { time: formatTime(session.date) })}
      </Text>
      {session.location ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('probetraining.openMapA11y', { place: session.location })}
          onPress={() => openInMaps(session.location as string)}
          android_ripple={{ color: c.borderSubtle }}
          style={styles.mapLink}
        >
          <Icon name="mappin.and.ellipse" size="sm" color="tint" />
          <Text variant="subheadline" color="tint" weight="semibold" style={styles.shrink}>
            {session.location}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function SessionLines({ sessions }: { sessions: TrialSession[] }) {
  const { t } = useTranslation()
  return (
    <View style={styles.sessionList}>
      {sessions.map((session) => (
        <View key={session.id} style={styles.sessionLine}>
          <Icon name="calendar" size="sm" color={session.cancelledAt ? 'tertiary' : 'secondary'} />
          <Text
            variant="subheadline"
            color={session.cancelledAt ? 'tertiary' : 'primary'}
            tabular
            style={styles.shrink}
          >
            {`${formatSessionDay(session.date)} · ${formatTime(session.date)}`}
            {session.location ? ` · ${session.location}` : ''}
            {session.cancelledAt ? ` · ${t('probetraining.sessionCancelled')}` : ''}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function PlayerTrialCard({
  invite,
  busy,
  onAction,
  showStatus = true,
}: {
  invite: TrialInvite
  busy?: boolean
  onAction: (invite: TrialInvite, action: PlayerTrialAction) => void
  /** Off when the card already sits under a stage heading. */
  showStatus?: boolean
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const stage = stageOf(invite)
  const chip = statusChip(t, invite)
  const next = nextTrialSession(invite.sessions)
  const open = () => router.push({ pathname: '/trial/[id]', params: { id: invite.id } })

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${invite.club.name}, ${invite.team.displayName}, ${chip.label}`}
        onPress={open}
        android_ripple={{ color: c.borderSubtle }}
        style={styles.header}
      >
        <ClubBadge name={invite.club.name} badgeUrl={invite.club.badgeUrl} color={invite.club.primaryColor} />
        <View style={styles.flex}>
          <Text variant="headline" color="primary">
            {invite.club.name}
          </Text>
          <Text variant="footnote" color="secondary">
            {[invite.team.displayName, invite.team.leagueName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Icon name="chevron.right" size="sm" color="tertiary" />
      </Pressable>
      {showStatus ? <StatusPill label={chip.label} tone={chip.tone} /> : null}

      {stage === 'REQUESTED' ? (
        <>
          <Text variant="subheadline" color="secondary">
            {t('probetraining.requestedBody', { date: formatDate(invite.createdAt) })}
          </Text>
          <View style={styles.actions}>
            <Button
              label={t('probetraining.withdraw')}
              variant="plain"
              size="sm"
              disabled={busy}
              onPress={() => onAction(invite, 'WITHDRAWN')}
            />
          </View>
        </>
      ) : null}

      {stage === 'INVITED' ? (
        <>
          {invite.message ? <Quote text={invite.message} author={invite.sender?.name} /> : null}
          <SessionLines sessions={invite.sessions} />
          <Text variant="footnote" color="secondary" tabular>
            {t('probetraining.answerBy', { date: formatDate(invite.expiresAt) })}
          </Text>
          <View style={styles.actions}>
            <Button
              label={t('probetraining.accept')}
              size="md"
              disabled={busy}
              loading={busy}
              onPress={() => onAction(invite, 'ACCEPTED')}
              style={styles.grow}
              accessibilityLabel={t('probetraining.acceptA11y', { club: invite.club.name })}
            />
            <Button
              label={t('probetraining.decline')}
              variant="bordered"
              size="md"
              disabled={busy}
              onPress={() => onAction(invite, 'DECLINED')}
              style={styles.grow}
              accessibilityLabel={t('probetraining.declineA11y', { club: invite.club.name })}
            />
          </View>
        </>
      ) : null}

      {stage === 'SCHEDULED' ? (
        <>
          {next ? <NextSessionBlock session={next} /> : <SessionLines sessions={invite.sessions} />}
          <Text variant="footnote" color="secondary">
            {t('probetraining.scheduledHint')}
          </Text>
        </>
      ) : null}

      {stage === 'DECISION' ? <DecisionBlock invite={invite} busy={busy} onAction={onAction} /> : null}
    </View>
  )
}

function DecisionBlock({
  invite,
  busy,
  onAction,
}: {
  invite: TrialInvite
  busy?: boolean
  onAction: (invite: TrialInvite, action: PlayerTrialAction) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  if (invite.status !== 'OFFERED') {
    return (
      <Text variant="subheadline" color="secondary">
        {t('probetraining.waitingDecision', { club: invite.club.name })}
      </Text>
    )
  }
  if (invite.joinRequest) {
    return (
      <View style={[styles.offer, { borderColor: c.borderDefault }]}>
        <Icon name="checkmark.seal.fill" size="lg" color="success" />
        <View style={styles.flex}>
          <Text variant="headline" color="primary">
            {t('probetraining.applicationSentTitle')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('probetraining.applicationSentBody', { club: invite.club.name })}
          </Text>
        </View>
      </View>
    )
  }
  return (
    <View style={[styles.offerCard, { backgroundColor: c.primary50 }]}>
      <Text variant="title3" color="primary">
        {t('probetraining.offerTitle', { team: invite.team.displayName })}
      </Text>
      {invite.decisionMessage ? (
        <Quote text={invite.decisionMessage} author={invite.sender?.name} />
      ) : null}
      <Text variant="subheadline" color="secondary">
        {t('probetraining.offerBody')}
      </Text>
      <Button
        label={t('probetraining.fillApplication')}
        onPress={() =>
          router.push({ pathname: '/aufnahmeantrag/[trialId]', params: { trialId: invite.id } })
        }
        fullWidth
      />
      <Button
        label={t('probetraining.declineOffer')}
        variant="plain"
        size="sm"
        disabled={busy}
        onPress={() => onAction(invite, 'DECLINE_OFFER')}
      />
    </View>
  )
}

export function Quote({ text, author }: { text: string; author?: string | null }) {
  const c = useClubColors()
  return (
    <View style={[styles.quote, { borderStartColor: c.borderStrong }]}>
      <Text variant="body" color="primary">
        {text}
      </Text>
      {author ? (
        <Text variant="footnote" color="secondary">
          {author}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING_LG,
    gap: SPACING_MD,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD, minHeight: 44 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  grow: { flexGrow: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  sessionList: { gap: SPACING_XS },
  sessionLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM },
  nextBlock: {
    padding: SPACING_LG,
    gap: SPACING_XS,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    minHeight: 44,
  },
  offer: {
    flexDirection: 'row',
    gap: SPACING_MD,
    padding: SPACING_MD,
    borderWidth: hairline,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  offerCard: {
    padding: SPACING_LG,
    gap: SPACING_MD,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  quote: {
    borderStartWidth: 2,
    paddingStart: SPACING_MD,
    gap: SPACING_XS,
  },
})
