import { getUpdateStateFromResponse } from './useUpdateCheck'

describe('getUpdateStateFromResponse', () => {
  function createResponse(status: number, headers: Record<string, string> = {}) {
    return {
      status,
      headers: {
        get: (key: string) => headers[key.toLowerCase()] ?? null,
      },
    } as Pick<Response, 'status' | 'headers'>
  }

  it('returns a force update state for 426 responses', () => {
    expect(
      getUpdateStateFromResponse(createResponse(426), {
        error: { minVersion: '1.2.0' },
      }),
    ).toEqual({
      forceUpdate: true,
      softUpdate: false,
      minVersion: '1.2.0',
    })
  })

  it('returns a soft update state when the response includes a recommended version header', () => {
    expect(
      getUpdateStateFromResponse(createResponse(200, { 'x-update-available': '1.3.0' })),
    ).toEqual({
      forceUpdate: false,
      softUpdate: true,
      recommendedVersion: '1.3.0',
    })
  })
})
