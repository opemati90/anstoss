import * as ImagePicker from 'expo-image-picker'
import { api } from '../api/client'
import { ensurePickerMediaAccess } from '../utils/mediaPermissions'

/** "Wappen hochladen" on "Dein Verein": a square image from the library. */
export async function pickClubBadge(): Promise<string | null> {
  try {
    if (!(await ensurePickerMediaAccess())) return null
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return null
    return result.assets[0].uri
  } catch {
    return null
  }
}

/**
 * Contract (BACKEND_GAPS): POST /uploads/club-badge { contentType } →
 * { uploadId, uploadUrl }; the file is PUT to `uploadUrl` and the claim
 * carries `badgeUploadId`. Any failure (no endpoint yet) returns null: the
 * club starts with the initials crest and the badge can be added later.
 */
export async function uploadClubBadge(uri: string): Promise<string | null> {
  try {
    const target = await api<{ uploadId?: string; uploadUrl?: string }>('/uploads/club-badge', {
      method: 'POST',
      body: { contentType: 'image/png' },
    })
    if (!target?.uploadId || !target.uploadUrl) return null
    const file = await fetch(uri)
    const blob = await file.blob()
    const put = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    })
    return put.ok ? target.uploadId : null
  } catch {
    return null
  }
}
