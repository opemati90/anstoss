import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { ensurePickerMediaAccess } from '../../utils/mediaPermissions'

/**
 * Local attachments picked in the composer, before upload. Channels and DMs
 * share this shape; each surface uploads through its own presign endpoint.
 */
export type ChatAttachment =
  | { kind: 'voice'; uri: string; durationMs: number; contentType: string }
  | { kind: 'image'; uri: string; contentType: string; width?: number; height?: number }
  | {
      kind: 'video'
      uri: string
      contentType: string
      width?: number
      height?: number
      durationMs?: number
    }
  | { kind: 'file'; uri: string; contentType: 'application/pdf'; fileName: string; sizeBytes?: number }

export type ChatAttachmentType = 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE'

export function attachmentMessageType(att: ChatAttachment): ChatAttachmentType {
  return att.kind === 'voice' ? 'VOICE' : att.kind === 'video' ? 'VIDEO' : att.kind === 'file' ? 'FILE' : 'IMAGE'
}

/** Metadata the API stores next to the attachment (chatMediaMetaSchema). */
export function attachmentMeta(att: ChatAttachment): Record<string, unknown> {
  if (att.kind === 'voice') return { durationMs: Math.round(att.durationMs) }
  if (att.kind === 'file') {
    return {
      fileName: att.fileName.slice(0, 200),
      mimeType: att.contentType,
      ...(att.sizeBytes ? { sizeBytes: att.sizeBytes } : {}),
    }
  }
  const meta: Record<string, unknown> = {}
  if (att.width) meta.width = Math.round(att.width)
  if (att.height) meta.height = Math.round(att.height)
  if (att.kind === 'video' && att.durationMs) meta.durationMs = Math.round(att.durationMs)
  return meta
}

function fromAsset(asset: ImagePicker.ImagePickerAsset): ChatAttachment {
  if (asset.type === 'video') {
    return {
      kind: 'video',
      uri: asset.uri,
      // The API accepts MP4 only; iOS exports the pick as MP4 with this preset.
      contentType: 'video/mp4',
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration ?? undefined,
    }
  }
  return {
    kind: 'image',
    uri: asset.uri,
    contentType: asset.mimeType ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
  }
}

/** Photo or video from the library. */
export async function pickLibraryMedia(options: { videos?: boolean } = {}): Promise<ChatAttachment | null> {
  const hasAccess = await ensurePickerMediaAccess()
  if (!hasAccess) return null
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options.videos === false ? ['images'] : ['images', 'videos'],
    allowsEditing: false,
    quality: 0.8,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  })
  if (result.canceled || !result.assets?.[0]) return null
  return fromAsset(result.assets[0])
}

/** Kept for existing call sites: one photo from the library. */
export function pickChatImage(): Promise<ChatAttachment | null> {
  return pickLibraryMedia({ videos: false })
}

/** Camera shortcut in the composer. */
export async function takeCameraPhoto(): Promise<ChatAttachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return null
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
  if (result.canceled || !result.assets?.[0]) return null
  return fromAsset(result.assets[0])
}

/** A PDF (Trainingsplan, Spielbericht, Passantrag). */
export async function pickPdf(): Promise<ChatAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled || !result.assets?.[0]) return null
  const asset = result.assets[0]
  return {
    kind: 'file',
    uri: asset.uri,
    contentType: 'application/pdf',
    fileName: asset.name || 'Dokument.pdf',
    sizeBytes: asset.size ?? undefined,
  }
}
