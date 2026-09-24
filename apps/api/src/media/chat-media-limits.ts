/**
 * One definition of what chat uploads may be, shared by the channel presign
 * (MediaController), the channel send (ChatService.postMedia) and the DM
 * presign/send (DmService) so the two surfaces cannot drift.
 */
export type ChatUploadKind = 'voice' | 'image' | 'video' | 'file'
export type ChatAttachmentType = 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE'

export const CHAT_UPLOAD_MAX_BYTES: Record<ChatUploadKind, number> = {
  voice: 25 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  file: 25 * 1024 * 1024,
}

export const CHAT_UPLOAD_CONTENT_TYPES: Record<ChatUploadKind, ReadonlySet<string>> = {
  voice: new Set(['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm']),
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  video: new Set(['video/mp4']),
  file: new Set(['application/pdf']),
}

export const ALL_CHAT_UPLOAD_CONTENT_TYPES: ReadonlySet<string> = new Set(
  Object.values(CHAT_UPLOAD_CONTENT_TYPES).flatMap((set) => Array.from(set)),
)

export function uploadKindFor(type: ChatAttachmentType): ChatUploadKind {
  return type.toLowerCase() as ChatUploadKind
}

export function safeUploadName(filename: string | undefined): string {
  return (filename || `m-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)
}
