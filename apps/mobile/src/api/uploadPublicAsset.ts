type PublicAssetReservation = {
  enabled: boolean
  uploadUrl: string | null
  publicUrl: string | null
}

export class AssetUploadError extends Error {
  constructor() {
    // Screens display their localized failure message, never provider details.
    super('Asset upload failed')
    this.name = 'AssetUploadError'
  }
}

/** Public images only. Never persist a local URI or acknowledge a failed PUT. */
export async function uploadPublicAsset(
  reservation: PublicAssetReservation,
  blob: Blob,
  contentType: string,
): Promise<string> {
  if (!reservation.enabled || !reservation.uploadUrl || !reservation.publicUrl || blob.size < 1) {
    throw new AssetUploadError()
  }
  try {
    for (const value of [reservation.uploadUrl, reservation.publicUrl]) {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password) throw new AssetUploadError()
    }
  } catch {
    throw new AssetUploadError()
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new AssetUploadError())
      controller.abort()
    }, 60_000)
  })
  try {
    const response = await Promise.race([
      fetch(reservation.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
        signal: controller.signal,
      }),
      deadline,
    ])
    if (controller.signal.aborted || !response.ok) throw new AssetUploadError()
    return reservation.publicUrl
  } catch {
    // No automatic PUT retry: a timeout can mean the write succeeded.
    throw new AssetUploadError()
  } finally {
    clearTimeout(timeout!)
  }
}
