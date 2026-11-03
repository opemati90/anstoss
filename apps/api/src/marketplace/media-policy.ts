export const MEDIA_ALLOWED_CONTENT_TYPES: Record<'PHOTO' | 'VIDEO', ReadonlySet<string>> = {
  PHOTO: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  VIDEO: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
}

export function freeAgentMediaLimit(type: 'PHOTO' | 'VIDEO'): number {
  return (type === 'VIDEO' ? 100 : 10) * 1024 * 1024
}
