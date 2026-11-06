import { isOpaqueV1Key, newOpaqueV1Key, opaqueV1ScopeFingerprint } from './opaque-v1-binding'

describe('opaque v1 upload binding', () => {
  const scope = { ownerId: 'player', clubId: 'club', targetId: 'team', targetType: 'chat' as const, kind: 'image' as const }

  it('generates unique canonical keys without identifiers or filenames', () => {
    const first = newOpaqueV1Key()
    const second = newOpaqueV1Key()
    expect(first).not.toBe(second)
    expect(isOpaqueV1Key(first)).toBe(true)
    for (const identifier of ['player', 'club', 'team', 'photo.jpg']) expect(first).not.toContain(identifier)
    for (const bad of [`${first}/other`, `${first}?x=1`, `${first}\n`, first.toUpperCase()]) expect(isOpaqueV1Key(bad)).toBe(false)
  })

  it('binds every authority field independently and consistently', () => {
    const fingerprint = opaqueV1ScopeFingerprint(scope)
    expect(opaqueV1ScopeFingerprint({ ...scope })).toBe(fingerprint)
    for (const change of [{ ownerId: 'other' }, { clubId: 'other' }, { targetId: 'other' },
      { targetType: 'dm' as const }, { kind: 'file' as const }]) {
      expect(opaqueV1ScopeFingerprint({ ...scope, ...change })).not.toBe(fingerprint)
    }
  })

  it('rejects malformed scope segments', () => {
    for (const id of ['', '../club', 'a/b', 'a\nb', 'x'.repeat(257)]) {
      expect(() => opaqueV1ScopeFingerprint({ ...scope, clubId: id })).toThrow('Invalid opaque upload scope')
    }
  })
})
