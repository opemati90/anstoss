import { ClubsSearchController } from './clubs-search.controller'
import { ClubsSearchService } from './clubs-search.service'

describe('ClubsSearchController', () => {
  function makeController(search: jest.Mock) {
    const svc = { search } as unknown as ClubsSearchService
    return new ClubsSearchController(svc)
  }

  it('validates query via Zod and calls service', async () => {
    const search = jest.fn().mockResolvedValue({ results: [], nextCursor: null })
    const ctrl = makeController(search)

    const out = await ctrl.searchClubs({ q: 'bayern', limit: '5' })

    expect(search).toHaveBeenCalledWith({ q: 'bayern', limit: 5 })
    expect(out).toEqual({ results: [], nextCursor: null })
  })

  it('rejects single-character query', async () => {
    const search = jest.fn()
    const ctrl = makeController(search)

    await expect(ctrl.searchClubs({ q: 'F' })).rejects.toThrow()
    expect(search).not.toHaveBeenCalled()
  })
})
