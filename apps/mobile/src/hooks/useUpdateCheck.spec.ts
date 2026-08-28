import { act, renderHook } from '@testing-library/react-native'
import { getUpdateStateFromResponse, useUpdateCheck } from './useUpdateCheck'

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
      forceUpdateMessage: undefined,
    })
  })

  it('returns a soft update state when the response includes a recommended version header', () => {
    expect(
      getUpdateStateFromResponse(createResponse(200, { 'x-update-available': '1.3.0' })),
    ).toEqual({
      forceUpdate: false,
      softUpdate: true,
      recommendedVersion: '1.3.0',
      announcement: undefined,
    })
  })

  it('returns the custom force-update message from the API', () => {
    expect(
      getUpdateStateFromResponse(createResponse(426), {
        error: { minVersion: '2.0.0', message: 'Install the supported release.' },
      }),
    ).toMatchObject({
      forceUpdate: true,
      forceUpdateMessage: 'Install the supported release.',
    })
  })

  it('decodes an announcement even when no update is required', () => {
    expect(
      getUpdateStateFromResponse(
        createResponse(200, {
          'x-anstoss-announcement': encodeURIComponent('Maintenance at 20:00'),
        }),
      ),
    ).toEqual({
      forceUpdate: false,
      softUpdate: false,
      recommendedVersion: undefined,
      announcement: 'Maintenance at 20:00',
    })
  })

  it('keeps a dismissed notice hidden until the server clears or changes it', () => {
    const announcementResponse = createResponse(200, {
      'x-anstoss-announcement': encodeURIComponent('Maintenance at 20:00'),
    }) as Response
    const clearResponse = createResponse(200) as Response
    const changedResponse = createResponse(200, {
      'x-anstoss-announcement': encodeURIComponent('Maintenance complete'),
    }) as Response
    const { result } = renderHook(() => useUpdateCheck())

    act(() => result.current.checkResponse(announcementResponse))
    expect(result.current.announcement).toBe('Maintenance at 20:00')
    act(() => result.current.dismissAnnouncement())
    act(() => result.current.checkResponse(announcementResponse))
    expect(result.current.announcement).toBeUndefined()
    act(() => result.current.checkResponse(clearResponse))
    expect(result.current.announcement).toBeUndefined()
    act(() => result.current.checkResponse(changedResponse))
    expect(result.current.announcement).toBe('Maintenance complete')
  })

  it('clears a visible recommended update when the server removes the header', () => {
    const { result } = renderHook(() => useUpdateCheck())
    act(() =>
      result.current.checkResponse(
        createResponse(200, { 'x-update-available': '1.4.0' }) as Response,
      ),
    )
    expect(result.current.softUpdate).toBe(true)

    act(() => result.current.checkResponse(createResponse(200) as Response))

    expect(result.current.softUpdate).toBe(false)
    expect(result.current.recommendedVersion).toBeUndefined()
  })
})
