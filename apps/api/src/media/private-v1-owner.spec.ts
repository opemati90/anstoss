import { isOwnedPrivateV1Key, newOwnedPrivateV1Key } from './private-v1-owner'
import { safeUploadName } from './chat-media-limits'
import { R2Provider } from '../assets/r2.provider'

describe('private v1 upload ownership', () => {
  const scope = { ownerId: 'u1', clubId: 'club', targetId: 'team', kind: 'image' as const, targetType: 'chat' as const }

  it('binds a server-generated key to sender, club, target and media kind', () => {
    const key = newOwnedPrivateV1Key(scope, 'photo.jpg')
    expect(key).not.toContain('photo.jpg')
    expect(isOwnedPrivateV1Key(key, scope)).toBe(true)
    expect(isOwnedPrivateV1Key(key, { ...scope, ownerId: 'u2' })).toBe(false)
    expect(isOwnedPrivateV1Key(key, { ...scope, clubId: 'other' })).toBe(false)
    expect(isOwnedPrivateV1Key(key, { ...scope, targetId: 'other' })).toBe(false)
    expect(isOwnedPrivateV1Key(key, { ...scope, kind: 'file' })).toBe(false)
    expect(isOwnedPrivateV1Key(key, { ...scope, targetType: 'dm' })).toBe(false)
  })

  it('rejects old, malformed, aliased and caller-chosen key suffixes', () => {
    const key = newOwnedPrivateV1Key(scope, 'photo.jpg')
    expect(isOwnedPrivateV1Key('chat/club/team/image/private-v1-old.jpg', scope)).toBe(false)
    expect(isOwnedPrivateV1Key(`${key}/other`, scope)).toBe(false)
    expect(isOwnedPrivateV1Key(`${key}?x=1`, scope)).toBe(false)
    expect(isOwnedPrivateV1Key(`${key}\n`, scope)).toBe(false)
    expect(isOwnedPrivateV1Key(key.replace('attachment', 'a..jpg'), scope)).toBe(false)
    expect(isOwnedPrivateV1Key(key.replace('attachment', 'a'.repeat(121)), scope)).toBe(false)
    // Previously issued keys remain valid while clients complete existing uploads.
    expect(isOwnedPrivateV1Key(key.replace('attachment', 'photo.jpg'), scope)).toBe(true)
    expect(isOwnedPrivateV1Key(key.replace('/image/', '/file/'), scope)).toBe(false)
    expect(() => newOwnedPrivateV1Key(scope, '../photo.jpg')).toThrow('Invalid upload scope or name')
    for (const name of ['a..jpg', '.', '..', 'folder/file', 'folder\\file', 'x%2fy', 'a'.repeat(121)]) {
      expect(() => newOwnedPrivateV1Key(scope, name)).toThrow('Invalid upload scope or name')
    }
    for (const segment of ['', '..', 'a/b', 'a\\b', 'a%2fb', 'a\n']) {
      expect(() => newOwnedPrivateV1Key({ ...scope, targetId: segment }, 'photo.jpg')).toThrow('Invalid upload scope or name')
      expect(isOwnedPrivateV1Key(key, { ...scope, clubId: segment })).toBe(false)
    }
  })

  it('presigns unusual filenames into canonical URLs that can be resolved later', () => {
    expect(safeUploadName('a..jpg')).toBe('a_jpg')
    expect(safeUploadName('../photo.png')).toBe('_-photo.png')
    expect(safeUploadName('.')).toBe('file')
    for (const filename of ['a..jpg', '../photo.png', 'pïctüre .. 1.png']) {
      const key = newOwnedPrivateV1Key(scope, safeUploadName(filename))
      const url = `https://private-media.anstoss.invalid/${key}`
      expect(new R2Provider().objectKeyFromUrl(url)).toBe(key)
      expect(isOwnedPrivateV1Key(key, scope)).toBe(true)
    }
  })
})
