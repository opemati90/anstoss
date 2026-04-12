import {
  activateE2EScenario,
  clearE2ESession,
  handleE2EApiRequest,
} from '../e2e/session'

describe('E2E API session shim', () => {
  afterEach(async () => {
    await clearE2ESession()
  })

  it('handles tab conversation requests without falling through to the real API', async () => {
    await activateE2EScenario('player')

    const response = handleE2EApiRequest(
      '/clubs/club-e2e-sv-albatros/conversations',
      { method: 'GET' },
    )

    expect(response.handled).toBe(true)
    if (!response.handled) {
      throw new Error('Expected E2E request to be handled')
    }
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conversation-e2e-team',
          unreadCount: 0,
        }),
      ]),
    )
  })
})
