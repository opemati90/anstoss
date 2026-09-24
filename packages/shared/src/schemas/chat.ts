import { z } from 'zod'
import { CHAT } from '../constants/limits'

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

/** REST channel post (AnnounceSheet / home composer). */
export const postChannelMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
})
export type PostChannelMessageInput = z.infer<typeof postChannelMessageSchema>
