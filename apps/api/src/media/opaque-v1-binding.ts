import { createHash, randomBytes } from 'node:crypto'
import type { ChatUploadKind } from './chat-media-limits'

/** Internal building blocks only. These keys are not issued by live routes. */
export type OpaqueV1Scope = {
  ownerId: string
  clubId: string
  targetId: string
  targetType: 'chat' | 'dm'
  kind: ChatUploadKind
}

const KEY_PATTERN = /^private-chat\/v1\/[0-9a-f]{64}(?![\s\S])/
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+(?![\s\S])/
const KINDS = new Set<ChatUploadKind>(['image', 'video', 'voice', 'file'])

function validateScope(scope: OpaqueV1Scope): void {
  const validSegment = (value: unknown) => typeof value === 'string' && value.length > 0
    && value.length <= 256 && SEGMENT_PATTERN.test(value)
  if (!scope || !validSegment(scope.ownerId) || !validSegment(scope.clubId) || !validSegment(scope.targetId)
    || !['chat', 'dm'].includes(scope.targetType) || !KINDS.has(scope.kind)) {
    throw new Error('Invalid opaque upload scope')
  }
}

/** 256 bits of entropy; the key contains no sender, destination or filename. */
export function newOpaqueV1Key(): string {
  return `private-chat/v1/${randomBytes(32).toString('hex')}`
}

export function isOpaqueV1Key(key: string): boolean {
  return typeof key === 'string' && KEY_PATTERN.test(key)
}

/** Persist this binding in the upload ledger, never in the object key. */
export function opaqueV1ScopeFingerprint(scope: OpaqueV1Scope): string {
  validateScope(scope)
  return createHash('sha256').update(JSON.stringify([
    'opaque-private-v1', scope.targetType, scope.clubId, scope.targetId, scope.ownerId, scope.kind,
  ])).digest('hex')
}
