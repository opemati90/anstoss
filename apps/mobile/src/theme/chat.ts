/**
 * Chat revamp tokens: muted, legible sender-name colours for group chats
 * (two variants per hue: darker for light mode, lighter for dark mode) and
 * the scrim behind media overlays (time stamp on photos, play badge).
 */
export const CHAT_SENDER_PALETTE: ReadonlyArray<{ light: string; dark: string }> = [
  { light: '#3C6E9E', dark: '#8FB5DA' },
  { light: '#8A5A2B', dark: '#D6A774' },
  { light: '#6B4F9A', dark: '#B59EDC' },
  { light: '#2F7A6B', dark: '#7FC9B8' },
  { light: '#A0485B', dark: '#E0949F' },
  { light: '#5E6B2A', dark: '#B4C07A' },
  { light: '#3E6470', dark: '#93BAC6' },
  { light: '#8C4E86', dark: '#D29ACB' },
]

/** Scrim colour for text/icons laid over photos and videos. */
export const CHAT_MEDIA_SCRIM = '#000000'
/** Foreground on the media scrim (theme independent: always over a photo). */
export const CHAT_ON_MEDIA = '#FFFFFF'
