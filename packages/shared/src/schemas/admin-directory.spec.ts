import { adminDirectoryQuerySchema } from './platform'

describe('admin directory query', () => {
  it('defaults to a bounded all-accounts page', () => {
    expect(adminDirectoryQuerySchema.parse({})).toEqual({
      kind: 'users',
      search: '',
      role: 'all',
      state: 'all',
      limit: 25,
      offset: 0,
    })
  })
  it('parses URL numbers and trims search', () => {
    expect(
      adminDirectoryQuerySchema.parse({
        kind: 'players',
        search: '  Berlin  ',
        limit: '50',
        offset: '100',
        clubId: 'club-a',
        teamId: 'team-a',
      }),
    ).toMatchObject({
      kind: 'players',
      search: 'Berlin',
      limit: 50,
      offset: 100,
      clubId: 'club-a',
      teamId: 'team-a',
    })
  })
  it.each([
    { limit: 101 },
    { limit: 0 },
    { limit: 'abc' },
    { offset: -1 },
    { offset: 1.2 },
    { offset: 1000001 },
    { kind: 'admins' },
    { role: 'root' },
    { state: 'suspended' },
    { search: 'a'.repeat(121) },
    { clubId: '' },
    { teamId: 'a'.repeat(101) },
    { search: ['a', 'b'] },
  ])('rejects invalid filters %j', (query) => {
    expect(adminDirectoryQuerySchema.safeParse(query).success).toBe(false)
  })
})
