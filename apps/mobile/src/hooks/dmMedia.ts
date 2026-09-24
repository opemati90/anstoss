import type {
  DirectMessageItem,
  DmLineupInput,
  DmLineupOption,
  DmMediaKind,
  SendDirectMessageInput,
} from '@anstoss/shared'
import { api, ApiError } from '../api/client'

/**
 * REST side of direct messages with attachments. DMs reuse the channel media
 * pipeline: presign → PUT the bytes to R2 → POST the message with the public
 * URL (the API HEAD-validates type and size) → signed GET per render.
 */

const conversationPath = (clubId: string, conversationId: string) =>
  `/clubs/${clubId}/conversations/${conversationId}`

export type DmSendResult =
  | { ok: true; message: DirectMessageItem }
  | { ok: false; reason: 'forbidden' | 'failed' }

export async function postDirectMessage(
  clubId: string,
  conversationId: string,
  input: SendDirectMessageInput,
): Promise<DmSendResult> {
  try {
    const message = await api<DirectMessageItem>(`${conversationPath(clubId, conversationId)}/messages`, {
      method: 'POST',
      body: input,
    })
    if (!message || typeof message !== 'object' || !('id' in message)) return { ok: false, reason: 'failed' }
    return { ok: true, message }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
      return { ok: false, reason: 'forbidden' }
    }
    return { ok: false, reason: 'failed' }
  }
}

export type DmUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: 'unavailable' | 'forbidden' | 'failed' }

/** Upload a local file for a DM attachment. */
export async function uploadDmMedia(input: {
  clubId: string
  conversationId: string
  uri: string
  contentType: string
  kind: DmMediaKind
  filename?: string
}): Promise<DmUploadResult> {
  let blob: Blob
  try {
    const fileResp = await fetch(input.uri)
    blob = await fileResp.blob()
  } catch {
    return { ok: false, reason: 'failed' }
  }
  let presign: { enabled: boolean; uploadUrl: string | null; publicUrl: string | null } | undefined
  try {
    presign = await api(`${conversationPath(input.clubId, input.conversationId)}/media/presign`, {
      method: 'POST',
      body: {
        kind: input.kind,
        contentType: input.contentType,
        ...(input.filename ? { filename: input.filename } : {}),
        sizeBytes: blob.size,
      },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { ok: false, reason: 'forbidden' }
    return { ok: false, reason: 'failed' }
  }
  if (!presign?.enabled || !presign.uploadUrl || !presign.publicUrl) {
    return { ok: false, reason: 'unavailable' }
  }
  try {
    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      body: blob,
    })
    if (!put.ok) return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
  return { ok: true, publicUrl: presign.publicUrl }
}

export async function fetchDmLineupOptions(
  clubId: string,
  conversationId: string,
): Promise<DmLineupOption[]> {
  const list = await api<DmLineupOption[]>(`${conversationPath(clubId, conversationId)}/lineup-options`)
  return Array.isArray(list) ? list : []
}

export async function setDmReaction(
  clubId: string,
  conversationId: string,
  messageId: string,
  emoji: string,
  on: boolean,
): Promise<DirectMessageItem | null> {
  try {
    const base = `${conversationPath(clubId, conversationId)}/messages/${messageId}/reactions`
    const result = on
      ? await api<DirectMessageItem>(base, { method: 'POST', body: { emoji } })
      : await api<DirectMessageItem>(`${base}/${encodeURIComponent(emoji)}`, { method: 'DELETE' })
    return result && typeof result === 'object' && 'id' in result ? result : null
  } catch {
    return null
  }
}

export async function deleteDirectMessage(
  clubId: string,
  conversationId: string,
  messageId: string,
): Promise<DirectMessageItem | null> {
  try {
    const result = await api<DirectMessageItem>(
      `${conversationPath(clubId, conversationId)}/messages/${messageId}`,
      { method: 'DELETE' },
    )
    return result && typeof result === 'object' && 'id' in result ? result : null
  } catch {
    return null
  }
}

export type { DmLineupInput }
