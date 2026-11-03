/**
 * One definition of what chat uploads may be, shared by the channel presign
 * (MediaController), the channel send (ChatService.postMedia) and the DM
 * presign/send (DmService) so the two surfaces cannot drift.
 */
import { CHAT_UPLOAD_CONTENT_TYPES } from '@anstoss/shared'
import type { ChatUploadKind, ChatAttachmentType } from '@anstoss/shared'
export { CHAT_UPLOAD_MAX_BYTES, CHAT_UPLOAD_CONTENT_TYPES } from '@anstoss/shared'
export type { ChatUploadKind, ChatAttachmentType } from '@anstoss/shared'

export const ALL_CHAT_UPLOAD_CONTENT_TYPES: ReadonlySet<string> = new Set(
  Object.values(CHAT_UPLOAD_CONTENT_TYPES).flatMap((set) => Array.from(set)),
)

export function uploadKindFor(type: ChatAttachmentType): ChatUploadKind {
  return type.toLowerCase() as ChatUploadKind
}

export function safeUploadName(filename: string | undefined): string {
  const name = (filename || `m-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.{2,}/g, '_').slice(0, 120)
  return name === '.' ? 'file' : name
}
