import { createElement, useEffect, useState } from 'react'
import { act, render, renderHook } from '@testing-library/react-native'
import { useTypingPresence } from './useTypingPresence'

describe('ephemeral typing presence', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('settles when the conversation reports presence back to its parent header', () => {
    let renders = 0
    function Conversation({ onTypingChange }: { onTypingChange: (names: string[]) => void }) {
      const { names } = useTypingPresence('thread-1', 2000)
      renders += 1
      // Bound the failed case so a regression cannot hang the test runner.
      if (renders > 10) throw new Error('Typing/header render feedback loop')
      useEffect(() => onTypingChange(names), [names, onTypingChange])
      return null
    }
    function HeaderOwner() {
      const [, setNames] = useState<string[]>([])
      return createElement(Conversation, { onTypingChange: setNames })
    }
    const screen = render(createElement(HeaderOwner))
    expect(renders).toBeLessThan(4)
    screen.unmount()
  })

  it('keeps the header dependency stable across renders and redundant clears', () => {
    const { result, rerender } = renderHook(() => useTypingPresence('thread-1', 2000))
    const empty = result.current.names
    rerender({})
    expect(result.current.names).toBe(empty)
    act(() => result.current.clear())
    expect(result.current.names).toBe(empty)
    act(() => result.current.touch('one', 'Mina'))
    const active = result.current.names
    rerender({})
    act(() => result.current.touch('one', 'Mina'))
    expect(result.current.names).toBe(active)
  })

  it('expires idle typing and refreshes the timeout on continued activity', () => {
    const { result } = renderHook(() => useTypingPresence('thread-1', 2000))
    act(() => result.current.touch('one', 'Mina'))
    act(() => jest.advanceTimersByTime(1500))
    act(() => result.current.touch('one', 'Mina'))
    act(() => jest.advanceTimersByTime(1500))
    expect(result.current.names).toEqual(['Mina'])
    act(() => jest.advanceTimersByTime(500))
    expect(result.current.names).toEqual([])
  })

  it('keeps same-named people independent when one sends or stops', () => {
    const { result } = renderHook(() => useTypingPresence('thread-1', 2000))
    act(() => { result.current.touch('one', 'Alex'); result.current.touch('two', 'Alex') })
    expect(result.current.names).toEqual(['Alex', 'Alex'])
    act(() => result.current.remove('one'))
    expect(result.current.names).toEqual(['Alex'])
    act(() => result.current.clear())
    expect(result.current.names).toEqual([])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears timers and names when switching conversations or unmounting', () => {
    const { result, rerender, unmount } = renderHook(({ scope }: { scope: string }) => useTypingPresence(scope, 2000), { initialProps: { scope: 'one' } })
    act(() => result.current.touch('one', 'Mina'))
    rerender({ scope: 'two' })
    expect(result.current.names).toEqual([])
    expect(jest.getTimerCount()).toBe(0)
    act(() => result.current.touch('two', 'Alex'))
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
