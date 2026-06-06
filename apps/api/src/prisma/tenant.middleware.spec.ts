import { TenantScopeViolationError } from '@anstoss/shared'
import { createTenantMiddleware } from './tenant.middleware'

describe('createTenantMiddleware', () => {
  function setup(clubId: string | undefined) {
    const onFailOpenRead = jest.fn()
    const next = jest.fn().mockResolvedValue('ok')
    const mw = createTenantMiddleware(() => clubId, onFailOpenRead)
    return { mw, next, onFailOpenRead }
  }

  const params = (over: Partial<Record<string, unknown>>) => ({
    model: 'Event',
    action: 'findMany',
    args: {},
    dataPath: [],
    runInTransaction: false,
    ...over,
  }) as any

  it('passes through models that are not tenant-scoped', async () => {
    const { mw, next, onFailOpenRead } = setup(undefined)
    await mw(params({ model: 'User', action: 'findMany' }), next)
    expect(next).toHaveBeenCalled()
    expect(onFailOpenRead).not.toHaveBeenCalled()
  })

  it('injects clubId into the where clause on reads', async () => {
    const { mw, next } = setup('club-1')
    const p = params({ action: 'findMany', args: { where: { teamId: 't1' } } })
    await mw(p, next)
    expect(p.args.where).toEqual({ teamId: 't1', clubId: 'club-1' })
  })

  it('injects clubId into data on create', async () => {
    const { mw, next } = setup('club-1')
    const p = params({ action: 'create', args: { data: { name: 'Match' } } })
    await mw(p, next)
    expect(p.args.data).toEqual({ name: 'Match', clubId: 'club-1' })
  })

  it('injects clubId into every row on createMany', async () => {
    const { mw, next } = setup('club-1')
    const p = params({ action: 'createMany', args: { data: [{ a: 1 }, { a: 2 }] } })
    await mw(p, next)
    expect(p.args.data).toEqual([
      { a: 1, clubId: 'club-1' },
      { a: 2, clubId: 'club-1' },
    ])
  })

  it('scopes both where and create on upsert', async () => {
    const { mw, next } = setup('club-1')
    const p = params({ action: 'upsert', args: { where: { id: 'e1' }, create: { name: 'x' } } })
    await mw(p, next)
    expect(p.args.where).toEqual({ id: 'e1', clubId: 'club-1' })
    expect(p.args.create).toEqual({ name: 'x', clubId: 'club-1' })
  })

  it('throws on a mutation when no clubId is in context (fail-closed)', async () => {
    const { mw, next } = setup(undefined)
    await expect(mw(params({ action: 'update', args: { where: { id: 'e1' } } }), next)).rejects.toBeInstanceOf(
      TenantScopeViolationError,
    )
    await expect(mw(params({ action: 'create', args: { data: {} } }), next)).rejects.toBeInstanceOf(
      TenantScopeViolationError,
    )
    await expect(mw(params({ action: 'delete', args: { where: { id: 'e1' } } }), next)).rejects.toBeInstanceOf(
      TenantScopeViolationError,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('lets reads through unscoped when no clubId is in context (fail-open) and audits them', async () => {
    const { mw, next, onFailOpenRead } = setup(undefined)
    const p = params({ action: 'findMany', args: { where: { teamId: 't1' } } })
    await mw(p, next)

    expect(next).toHaveBeenCalled()
    // No clubId was injected — read is intentionally unscoped here.
    expect(p.args.where).toEqual({ teamId: 't1' })
    expect(onFailOpenRead).toHaveBeenCalledWith('Event', 'findMany')
  })

  it('dedupes the fail-open audit signal per (model, action)', async () => {
    const { mw, next, onFailOpenRead } = setup(undefined)
    await mw(params({ action: 'findMany' }), next)
    await mw(params({ action: 'findMany' }), next)
    await mw(params({ action: 'count' }), next)

    expect(onFailOpenRead).toHaveBeenCalledTimes(2)
    expect(onFailOpenRead).toHaveBeenCalledWith('Event', 'findMany')
    expect(onFailOpenRead).toHaveBeenCalledWith('Event', 'count')
  })

  it('does not audit when the read is properly scoped', async () => {
    const { mw, next, onFailOpenRead } = setup('club-1')
    await mw(params({ action: 'findMany' }), next)
    expect(onFailOpenRead).not.toHaveBeenCalled()
  })
})
