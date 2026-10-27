import { __resetSignedChatMediaUrlCache, useSignedChatMediaUrl } from './useSignedChatMediaUrl'

/** Channel attachments share authorization and expiry handling with DMs. */
export const __resetSignedMediaUrlCache = __resetSignedChatMediaUrlCache

export function useSignedMediaUrl(
  messageId: string | undefined,
  fallbackUrl: string | null | undefined,
): string | null {
  return useSignedChatMediaUrl(messageId, fallbackUrl)
}
