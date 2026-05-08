/**
 * Typed push notification templates per event type.
 *
 * Each template defines how to format the title and body for a specific
 * notification type. Templates are i18n-ready: callers can pass localized
 * strings for dynamic parts like team/event names.
 */

export type NotificationType = keyof typeof PUSH_TEMPLATES

export const PUSH_TEMPLATES = {
  EVENT_CREATED: {
    title: (data: { teamName: string }) => `📅 ${data.teamName}`,
    body: (data: { eventType: string; eventTitle: string; date: string }) =>
      `New ${data.eventType}: ${data.eventTitle} on ${data.date}`,
    channelId: 'events',
  },
  EVENT_REMINDER: {
    title: (data: { eventTitle: string; timeUntil: string }) =>
      `⏰ ${data.eventTitle} in ${data.timeUntil}`,
    body: (data: { location?: string }) => data.location || 'Location TBD',
    channelId: 'events',
  },
  RSVP_UPDATE: {
    title: (data: { userName: string }) => `${data.userName} responded`,
    body: (data: { status: string; eventTitle: string }) =>
      `${data.status} for ${data.eventTitle}`,
    channelId: 'events',
  },
  CHAT_MESSAGE: {
    title: (data: { senderName: string; teamName: string }) =>
      `${data.senderName} in ${data.teamName}`,
    body: (data: { messagePreview: string }) => data.messagePreview,
    channelId: 'chat',
  },
  DM_MESSAGE: {
    title: (data: { senderName: string }) => data.senderName,
    body: (data: { messagePreview: string }) => data.messagePreview,
    channelId: 'chat',
  },
  ANNOUNCEMENT: {
    title: (data: { senderName: string }) => `📢 ${data.senderName}`,
    body: (data: { messagePreview: string }) => data.messagePreview,
    channelId: 'announcements',
  },
  JOIN_REQUEST: {
    title: () => 'New join request',
    body: (data: { userName: string; clubName: string }) =>
      `${data.userName} wants to join ${data.clubName}`,
    channelId: 'events',
  },
  JOIN_APPROVED: {
    title: (data: { clubName: string }) => `Welcome to ${data.clubName}!`,
    body: () => 'Your join request was approved',
    channelId: 'events',
  },
  CONTRIBUTION_PAID: {
    title: (data: { clubName: string }) => `${data.clubName}: payment received`,
    body: (data: { planName: string; amountLabel: string }) =>
      `${data.planName} marked paid · ${data.amountLabel}. Thanks!`,
    channelId: 'events',
  },
} as const

/**
 * Format a push notification using a typed template.
 *
 * Usage:
 *   const { title, body, channelId } = formatPush('DM_MESSAGE', {
 *     senderName: 'Max',
 *     messagePreview: 'Hey, are you coming to training?',
 *   })
 */
export function formatPush<T extends NotificationType>(
  type: T,
  data: Parameters<(typeof PUSH_TEMPLATES)[T]['title']>[0] &
    Parameters<(typeof PUSH_TEMPLATES)[T]['body']>[0],
): { title: string; body: string; channelId: string } {
  const template = PUSH_TEMPLATES[type]
  return {
    title: (template.title as (d: typeof data) => string)(data),
    body: (template.body as (d: typeof data) => string)(data),
    channelId: template.channelId,
  }
}
