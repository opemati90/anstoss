jest.mock('@clerk/clerk-expo', () => ({
  getClerkInstance: jest.fn(() => ({
    session: null,
  })),
}))

import { waitForSessionToken } from './clerkSession'

describe('waitForSessionToken', () => {
  it('retries until Clerk exposes a session token', async () => {
    const getToken = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('session-token')

    await expect(
      waitForSessionToken({
        getToken,
        timeoutMs: 100,
        initialIntervalMs: 1,
      }),
    ).resolves.toBe('session-token')
  })

  it('returns null when the session token never becomes available', async () => {
    const getToken = jest.fn<Promise<string | null>, []>().mockResolvedValue(null)

    await expect(
      waitForSessionToken({
        getToken,
        timeoutMs: 2,
        initialIntervalMs: 1,
      }),
    ).resolves.toBeNull()
  })
})
