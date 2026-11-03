import { createHash, randomUUID } from 'crypto'
import type { ChatUploadKind } from './chat-media-limits'

type UploadScope = {
  ownerId: string
  clubId: string
  targetId: string
  kind: ChatUploadKind
  targetType: 'chat' | 'dm'
}

function ownerTag(scope: UploadScope): string {
  return createHash('sha256').update(JSON.stringify([
    'private-v1-owner', scope.targetType, scope.clubId, scope.targetId, scope.ownerId,
  ])).digest('hex')
}

function validName(name: string): boolean {
  return name.length <= 120 && name !== '.' && !name.includes('..')
    && /^[A-Za-z0-9._-]+(?![\s\S])/.test(name)
}

function validScope(scope: UploadScope): boolean {
  const segment = (value: string) => typeof value === 'string' && value.length <= 256
    && /^[A-Za-z0-9_-]+(?![\s\S])/.test(value)
  return segment(scope.clubId) && segment(scope.targetId) && typeof scope.ownerId === 'string' && scope.ownerId.length > 0
}

/** The key is generated solely by the API; the signed capability cannot write
 * to a different key. The tag binds a new upload to its authenticated sender. */
export function newOwnedPrivateV1Key(scope: UploadScope, safeName: string): string {
  if (!validScope(scope) || !validName(safeName)) throw new Error('Invalid upload scope or name')
  return `${scope.targetType}/${scope.clubId}/${scope.targetId}/${scope.kind}/private-v1-u${ownerTag(scope)}-${randomUUID()}-${safeName}`
}

export function isOwnedPrivateV1Key(key: string, scope: UploadScope): boolean {
  if (!validScope(scope)) return false
  const prefix = `${scope.targetType}/${scope.clubId}/${scope.targetId}/${scope.kind}/private-v1-u${ownerTag(scope)}-`
  if (!key.startsWith(prefix)) return false
  const suffix = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(.+)(?![\s\S])/.exec(key.slice(prefix.length))
  return Boolean(suffix && validName(suffix[2]))
}
