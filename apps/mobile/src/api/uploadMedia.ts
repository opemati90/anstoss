import { API_URL } from './client'

export type PresignResponse = {
  enabled: boolean
  objectKey: string
  uploadUrl: string | null
  publicUrl: string | null
}

export type MediaKind = 'voice' | 'image' | 'video' | 'file'

/**
 * Upload a local URI (file://...) to R2 via the presigned PUT URL.
 * Returns the public URL of the uploaded asset, or null when the API
 * presign endpoint is not enabled (dev environments without R2 keys).
 */
export async function uploadMedia({
  teamId,
  token,
  uri,
  contentType,
  kind,
  filename,
}: {
  teamId: string
  token: string
  uri: string
  contentType: string
  kind: MediaKind
  filename?: string
}): Promise<{ publicUrl: string; objectKey: string } | null> {
  const presignRes = await fetch(`${API_URL}/teams/${teamId}/media/presign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contentType, kind, filename }),
  })
  if (!presignRes.ok) return null
  const presign = (await presignRes.json()) as PresignResponse
  if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) return null

  // Read the local file as a blob and PUT it.
  const fileResp = await fetch(uri)
  const blob = await fileResp.blob()

  const putResp = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (!putResp.ok) return null

  return { publicUrl: presign.publicUrl, objectKey: presign.objectKey }
}
