import { isFeatureEnabled } from '../utils/featureFlags'
import { router } from 'expo-router'

/**
 * Deep-link payload carried by a push (and stored with its inbox entry).
 * Two shapes coexist: legacy DM/event pushes use `type`, newer chat and
 * contribution pushes use `kind`.
 */
export type NotificationTarget = {
  type?: string
  kind?: string
  conversationId?: string
  eventId?: string
  teamId?: string
  channelId?: string
  messageId?: string
  fixtureId?: string
  trialInviteId?: string
  clubId?: string
  requestId?: string
}

/**
 * Open the screen a push or inbox entry points at. `ensureClub` switches the
 * active club first when the target belongs to another club.
 */
export function openNotificationTarget(data: NotificationTarget, ensureClub: () => void): void {
  if (!isFeatureEnabled('anstoss.officialFixtures') && isOfficialFixtureTarget(data)) return
  const action = data.type ?? data.kind
  if (!action) {
    // Trial pushes carry only an entity id; the trial detail serves the
    // player and the club staff alike.
    if (data.trialInviteId) {
      router.push({ pathname: '/trial/[id]', params: { id: data.trialInviteId } })
    }
    return
  }

  switch (action) {
    case 'consent_requested':
      router.push('/child-consent')
      break
    case 'consent_withdrawn':
    case 'compliance_reminder':
      router.push('/notifications')
      break
    case 'dm':
      if (data.conversationId) {
        ensureClub()
        router.push({
          pathname: '/chat/[id]',
          params: { id: data.conversationId, kind: 'dm' },
        } as never)
      }
      break
    case 'event':
    case 'event_created':
    case 'event_rsvp_reminder':
    case 'event_rsvp':
    case 'event_updated':
    case 'event_cancelled':
      if (data.eventId) {
        ensureClub()
        router.push({ pathname: '/event-detail', params: { eventId: data.eventId } })
      }
      break
    case 'join_request':
    case 'JOIN_REQUEST_REMINDER':
      // Coaches/admins land on the pending-requests queue to act on it.
      ensureClub()
      router.push('/pending-requests')
      break
    case 'join_approved':
    case 'join_rejected':
      // The requester just got a decision — drop them on home, which
      // re-derives their membership/holding state.
      router.push('/(tabs)' as never)
      break
    case 'GOAL_SCORED':
    case 'MATCH_FINAL':
      if (data.fixtureId) {
        router.push({
          pathname: '/match-detail',
          params: {
            fixtureId: data.fixtureId,
            ...(data.teamId ? { teamId: data.teamId } : {}),
          },
        })
      }
      break
    // Coach-recorded live match (goal / full time pushes).
    case 'live_goal':
    case 'live_full_time':
      if (data.eventId) {
        ensureClub()
        router.push({ pathname: '/match-live', params: { eventId: data.eventId } })
      }
      break
    // fussball.de fixture change (kick-off moved, result in).
    case 'fixture-sync':
      if (data.fixtureId && data.teamId) {
        ensureClub()
        router.push({
          pathname: '/match-detail',
          params: { fixtureId: data.fixtureId, teamId: data.teamId },
        })
      }
      break
    // club-admin revamp: a new chat report lands admins on the Meldungen queue.
    case 'moderation_report':
      ensureClub()
      router.push('/admin-reports' as never)
      break
    case 'TRIAL_INVITE':
    case 'TRIAL_RESPONSE':
      if (data.trialInviteId) {
        router.push({ pathname: '/trial/[id]', params: { id: data.trialInviteId } })
      } else {
        router.push('/notifications' as never)
      }
      break
    // Kader fix M2 (team agent): "you're up for Trikotwäsche" opens Aufgaben.
    case 'TEAM_DUTY_ASSIGNED':
      ensureClub()
      router.push('/aufgaben')
      break
    case 'CONTRIBUTION_PAID':
    case 'contribution':
      // contribution-paid (self-pay/admin-marked) and contribution
      // reminders both belong on the same screen — the user wants to
      // see status + outstanding plans in one place.
      ensureClub()
      router.push('/my-contributions')
      break
    case 'MEDIA_MESSAGE':
    case 'MESSAGE_REPLY':
    case 'MENTION':
    case 'CHAT_MESSAGE':
    case 'announcement':
    case 'LINEUP_POSTED':
      // Open the conversation itself when the push names its channel;
      // otherwise land on the inbox, which lists it on top.
      ensureClub()
      if (data.channelId) {
        router.push({
          pathname: '/chat/[id]',
          params: {
            id: data.channelId,
            kind: 'channel',
            ...(data.teamId ? { teamId: data.teamId } : {}),
          },
        } as never)
      } else {
        router.push('/(tabs)/chat' as never)
      }
      break
    default:
      // Unknown payload — drop the deep-link, the tap still
      // foregrounds the app which is a reasonable fallback.
      break
  }
}

/** Imported-fixture notifications are hidden while the integration is paused. */
export function isOfficialFixtureTarget(data: NotificationTarget): boolean {
  const action = data.type ?? data.kind
  return action === 'fixture-sync' || action === 'GOAL_SCORED' || action === 'MATCH_FINAL' ||
    action === 'FIXTURE_CHANGED' || Boolean(data.fixtureId && !data.eventId)
}
