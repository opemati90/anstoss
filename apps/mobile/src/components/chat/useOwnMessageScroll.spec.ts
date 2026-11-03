import { act, renderHook } from '@testing-library/react-native'
import { useOwnMessageScroll } from './useOwnMessageScroll'

describe('useOwnMessageScroll', () => {
  let callbacks: Array<FrameRequestCallback>
  beforeEach(() => {
    callbacks = []
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

  it('moves to the latest own message across two layout frames after a send', () => {
    const scroll = jest.fn()
    const { result, rerender } = renderHook(({ id, sender }: { id: string; sender: string }) => useOwnMessageScroll(id, sender, 'me', scroll),
      { initialProps: { id: 'old', sender: 'other' } })
    act(() => result.current.arm())
    rerender({ id: 'new', sender: 'me' })
    expect(callbacks).toHaveLength(1)
    act(() => callbacks[0](0))
    act(() => callbacks[1](0))
    expect(scroll).toHaveBeenCalledTimes(2)
  })

  it('does not move for an incoming message or a cancelled send', () => {
    const scroll = jest.fn()
    const { result, rerender } = renderHook(({ id, sender }: { id: string; sender: string }) => useOwnMessageScroll(id, sender, 'me', scroll),
      { initialProps: { id: 'old', sender: 'other' } })
    act(() => result.current.arm())
    rerender({ id: 'incoming', sender: 'other' })
    expect(callbacks).toHaveLength(0)
    act(() => result.current.cancel())
    rerender({ id: 'own', sender: 'me' })
    expect(callbacks).toHaveLength(0)
  })

  it('does not lose its scroll when a fast acknowledgement replaces the pending ID', () => {
    const scroll = jest.fn()
    const { result, rerender } = renderHook(({ id, sender }: { id: string; sender: string }) => useOwnMessageScroll(id, sender, 'me', scroll),
      { initialProps: { id: 'old', sender: 'other' } })
    act(() => result.current.arm())
    rerender({ id: 'pending:1', sender: 'me' })
    rerender({ id: 'saved:1', sender: 'me' })
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
    act(() => callbacks[0](0))
    act(() => callbacks[1](0))
    expect(scroll).toHaveBeenCalledTimes(2)
  })

  it('cancels scheduled scrolling if an optimistic send fails', () => {
    const scroll = jest.fn()
    const { result, rerender } = renderHook(({ id, sender }: { id: string; sender: string }) => useOwnMessageScroll(id, sender, 'me', scroll),
      { initialProps: { id: 'old', sender: 'other' } })
    act(() => result.current.arm())
    rerender({ id: 'pending:1', sender: 'me' })
    act(() => result.current.cancel())
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    act(() => callbacks[0](0))
    expect(scroll).not.toHaveBeenCalled()
  })

  it('does not scroll an unrelated own message after the arm expires', () => {
    jest.useFakeTimers()
    const scroll = jest.fn()
    const { result, rerender } = renderHook(({ id, sender }: { id: string; sender: string }) => useOwnMessageScroll(id, sender, 'me', scroll),
      { initialProps: { id: 'old', sender: 'other' } })
    act(() => result.current.arm())
    act(() => jest.advanceTimersByTime(10_000))
    rerender({ id: 'later', sender: 'me' })
    expect(callbacks).toHaveLength(0)
  })
})
