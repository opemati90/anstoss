import { z } from 'zod'
import { CHAT } from '../constants/limits'
import { CHAT_UPLOAD_CONTENT_TYPES, CHAT_UPLOAD_MAX_BYTES, type ChatUploadKind } from '../constants/chat-uploads'

// Chat revamp (inbox, groups, mute). Shared by the API controllers and the
// mobile create-group / mute flows so both sides validate the same shapes.

export const createGroupChannelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).optional(),
  teamId: z.string().min(1).optional(),
  // A group is at least the creator plus one other person.
  memberIds: z.array(z.string().min(1)).min(1).max(200),
})

export const updateChatMuteSchema = z
  .object({
    muted: z.boolean(),
    mutedUntil: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) => !value.mutedUntil || new Date(value.mutedUntil).getTime() > Date.now(),
    { message: 'mutedUntil must be in the future', path: ['mutedUntil'] },
  )

export const addChannelMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
})

export type CreateGroupChannelInput = z.infer<typeof createGroupChannelSchema>
export type UpdateChatMuteInput = z.infer<typeof updateChatMuteSchema>
export type AddChannelMembersInput = z.infer<typeof addChannelMembersSchema>

// ─── Direct-message attachments ─────────────────────────────────────────
// DMs reuse the channel media pipeline (presign → PUT to R2 → HEAD-validated
// on send → signed GET per render). Same kinds, content types and limits.

export const DM_MEDIA_KINDS = ['voice', 'image', 'video', 'file'] as const
export type DmMediaKind = (typeof DM_MEDIA_KINDS)[number]

export const presignDmMediaSchema = z.object({
  kind: z.enum(DM_MEDIA_KINDS),
  contentType: z.string().trim().min(1).max(100),
  filename: z.string().trim().max(200).optional(),
  sizeBytes: z.number().int().positive(),
})
export type PresignDmMediaInput = z.infer<typeof presignDmMediaSchema>

export const chatMediaMetaSchema = z
  .object({
    durationMs: z.number().int().nonnegative().max(60 * 60 * 1000).optional(),
    waveform: z.array(z.number().min(0).max(1)).max(128).optional(),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
    mimeType: z.string().max(100).optional(),
    fileName: z.string().max(200).optional(),
    sizeBytes: z.number().int().nonnegative().max(200 * 1024 * 1024).optional(),
  })
  .strict()

export const dmLineupSlotSchema = z.object({
  position: z.string().trim().min(1).max(12),
  playerName: z.string().trim().max(60),
})

/**
 * A lineup card in a DM. EVENT: a coach shares the saved Aufstellung of one of
 * their team's events (the server snapshots it). FORMATION: anyone shares a
 * formation card they drew (formation + named positions).
 */
export const dmLineupInputSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('EVENT'), eventId: z.string().min(1).max(64) }),
  z.object({
    source: z.literal('FORMATION'),
    formation: z
      .string()
      .trim()
      .regex(/^\d{1,2}(-\d{1,2}){1,4}$/, 'Formation like 4-4-2'),
    title: z.string().trim().max(60).optional(),
    slots: z.array(dmLineupSlotSchema).min(1).max(11),
  }),
])
export type DmLineupInput = z.infer<typeof dmLineupInputSchema>

const dmOptionalReply = {
  replyToId: z.string().min(1).max(64).optional(),
  clientMessageId: z.string().min(1).max(64).optional(),
}

export const sendDirectMessageSchema = z.union([
  z.object({
    messageType: z.literal('TEXT'),
    content: z.string().trim().min(1).max(CHAT.MAX_MESSAGE_LENGTH),
    ...dmOptionalReply,
  }),
  z.object({
    messageType: z.enum(['IMAGE', 'VIDEO', 'FILE', 'VOICE']),
    attachmentUrl: z.string().url().max(2048),
    attachmentMeta: chatMediaMetaSchema.optional(),
    content: z.string().trim().max(1000).optional(),
    ...dmOptionalReply,
  }),
  z.object({
    messageType: z.literal('LINEUP'),
    lineup: dmLineupInputSchema,
    content: z.string().trim().max(1000).optional(),
    ...dmOptionalReply,
  }),
])
export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>

/** V2 publication uses a server-owned upload intent, never a client-chosen URL. */
export const privateMediaPublishSchema = z.object({
  messageType: z.enum(['IMAGE', 'VIDEO', 'FILE', 'VOICE']),
  content: z.string().max(1000).trim().optional(),
  replyToId: z.string().min(1).max(200).optional(),
  attachmentMeta: chatMediaMetaSchema.extend({
    fileName: z.string().max(200).refine((value) => {
      for (const character of value) {
        const code = character.charCodeAt(0)
        if (code < 32 || code === 127) return false
      }
      return true
    }, 'Invalid filename').optional(),
  }).strict().optional(),
}).strict()
export type PrivateMediaPublishInput = z.infer<typeof privateMediaPublishSchema>

/** Identity and destination come from authorization, never the request body. */
export const privateMediaReserveSchema = z.object({
  requestId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  messageType: z.enum(['IMAGE', 'VIDEO', 'FILE', 'VOICE']),
  contentType: z.string().max(100),
  expectedBytes: z.number().int().positive().max(100 * 1024 * 1024),
}).strict().superRefine((input, ctx) => {
  const kind = input.messageType.toLowerCase() as ChatUploadKind
  if (!CHAT_UPLOAD_CONTENT_TYPES[kind].has(input.contentType)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contentType'], message: 'Unsupported attachment type' })
  }
  if (input.expectedBytes > CHAT_UPLOAD_MAX_BYTES[kind]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedBytes'], message: 'Attachment is too large' })
  }
})
export type PrivateMediaReserveInput = z.infer<typeof privateMediaReserveSchema>

export const privateMediaStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['RESERVED', 'PROCESSING', 'UPLOADING', 'READY', 'PUBLISHED', 'CANCELLED', 'EXPIRED']),
  expiresAt: z.string().datetime(),
}).strict()
export type PrivateMediaStatus = z.infer<typeof privateMediaStatusSchema>

/** REST channel post (AnnounceSheet / home composer). */
export const postChannelMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
})
export type PostChannelMessageInput = z.infer<typeof postChannelMessageSchema>
