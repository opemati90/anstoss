import type { ChatMediaItem, ChatMediaTab, MessageAttachmentMeta, MessageType } from '@anstoss/shared'

/**
 * Info-screen media grid (Medien / Dateien / Links), shared by channels and
 * direct messages so both tabs behave identically.
 */
export const CHAT_MEDIA_PAGE = 60

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']{3,2000}/gi

export function parseChatMediaTab(raw: unknown): ChatMediaTab {
  return raw === 'files' || raw === 'links' ? raw : 'media'
}

/** Prisma where-fragment for one tab (applied to Message or DirectMessage). */
export function chatMediaWhere(tab: ChatMediaTab): Record<string, unknown> {
  if (tab === 'media') {
    return { messageType: { in: ['IMAGE', 'VIDEO'] }, attachmentUrl: { not: null } }
  }
  if (tab === 'files') {
    return { messageType: 'FILE', attachmentUrl: { not: null } }
  }
  return { messageType: 'TEXT', content: { contains: 'http', mode: 'insensitive' } }
}

type MediaRow = {
  id: string
  messageType: string
  attachmentUrl: string | null
  attachmentMeta: unknown
  content: string
  createdAt: Date
  sender?: { name: string | null } | null
}

/** Rows (newest first) → ChatMediaItem[]; links expand to one item per URL. */
export function toChatMediaItems(rows: MediaRow[], tab: ChatMediaTab): ChatMediaItem[] {
  const out: ChatMediaItem[] = []
  for (const row of rows) {
    const base = {
      messageType: row.messageType as MessageType,
      attachmentUrl: row.attachmentUrl,
      attachmentMeta: (row.attachmentMeta as MessageAttachmentMeta | null) ?? null,
      senderName: row.sender?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    }
    if (tab !== 'links') {
      out.push({ id: row.id, ...base, content: row.content ?? '', url: null })
      continue
    }
    const urls = Array.from(new Set(row.content.match(URL_PATTERN) ?? []))
    urls.forEach((url, index) => {
      out.push({
        id: index === 0 ? row.id : `${row.id}:${index}`,
        ...base,
        attachmentUrl: null,
        attachmentMeta: null,
        content: url,
        url: url.replace(/[).,;:!?]+$/, ''),
      })
    })
    if (out.length >= CHAT_MEDIA_PAGE) break
  }
  return out.slice(0, CHAT_MEDIA_PAGE)
}
