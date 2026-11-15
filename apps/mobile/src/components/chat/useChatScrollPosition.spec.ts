import { act, renderHook } from '@testing-library/react-native'
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native'
import { useChatScrollPosition } from './useChatScrollPosition'

function layout(height: number) {
  return { nativeEvent: { layout: { height, width: 393, x: 0, y: 0 } } } as LayoutChangeEvent
}
function scroll(y: number, height = 600, content = 1200) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 393, height: content },
      layoutMeasurement: { width: 393, height },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>
}

describe('chronological chat scroll position', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  function setup(unreadIndex = -1, ready = true) {
    const list = { scrollToEnd: jest.fn(), scrollToIndex: jest.fn() }
    const listRef = { current: list as unknown as FlatList<string> }
    const onAtBottomChange = jest.fn()
    const hook = renderHook<ReturnType<typeof useChatScrollPosition<string>>, { loaded: boolean }>(
      ({ loaded }) =>
        useChatScrollPosition({
          listRef,
          ready: loaded,
          initialUnreadIndex: unreadIndex,
          onAtBottomChange,
        }),
      { initialProps: { loaded: ready } },
    )
    const flush = () => act(() => jest.advanceTimersByTime(32))
    const mount = (content = 1200) => {
      act(() => {
        hook.result.current.onLayout(layout(600))
        hook.result.current.onContentSizeChange(393, content)
      })
      flush()
    }
    return { ...hook, list, onAtBottomChange, flush, mount }
  }

  it('waits for both measurements, then opens at the latest message', () => {
    const h = setup()
    act(() => h.result.current.onLayout(layout(600)))
    h.flush()
    expect(h.list.scrollToEnd).not.toHaveBeenCalled()
    act(() => h.result.current.onContentSizeChange(393, 1200))
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenCalledWith({ animated: false })
  })

  it('initializes cached history even if readiness changes without a layout event', () => {
    const h = setup(-1, false)
    h.mount()
    expect(h.list.scrollToEnd).not.toHaveBeenCalled()
    h.rerender({ loaded: true })
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenCalledTimes(1)
  })

  it('opens unread history near the top instead of jumping past it', () => {
    const h = setup(8)
    h.mount()
    expect(h.list.scrollToIndex).toHaveBeenCalledWith({
      index: 8,
      viewPosition: 0.1,
      animated: false,
    })
    expect(h.list.scrollToEnd).not.toHaveBeenCalled()
  })

  it('keeps the latest message visible on keyboard open BEFORE any text input', () => {
    const h = setup()
    h.mount()
    h.list.scrollToEnd.mockClear()
    act(() => h.result.current.onLayout(layout(280)))
    act(() => h.result.current.onScroll(scroll(600, 280)))
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenCalledWith({ animated: false })
    expect(h.onAtBottomChange).not.toHaveBeenCalledWith(false)
  })

  it('handles iOS delivering the resized scroll event before onLayout', () => {
    const h = setup()
    h.mount()
    h.list.scrollToEnd.mockClear()
    act(() => h.result.current.onScroll(scroll(600, 280)))
    act(() => h.result.current.onLayout(layout(280)))
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenCalledTimes(1)
    expect(h.onAtBottomChange).not.toHaveBeenCalledWith(false)
  })

  it('does not pull readers away from older messages when keyboard opens or a page arrives', () => {
    const h = setup()
    h.mount()
    act(() => h.result.current.onScroll(scroll(100)))
    h.list.scrollToEnd.mockClear()
    act(() => {
      h.result.current.onLayout(layout(280))
      h.result.current.onContentSizeChange(393, 2400)
    })
    h.flush()
    expect(h.onAtBottomChange).toHaveBeenLastCalledWith(false)
    expect(h.list.scrollToEnd).not.toHaveBeenCalled()
  })

  it('follows newly appended messages only while already at latest', () => {
    const h = setup()
    h.mount()
    h.list.scrollToEnd.mockClear()
    act(() => h.result.current.onContentSizeChange(393, 1400))
    act(() => h.result.current.onScroll(scroll(600, 600, 1400)))
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenCalledTimes(1)
  })

  it('restores following after jumping to latest and handles keyboard dismissal', () => {
    const h = setup()
    h.mount()
    act(() => h.result.current.stopFollowing())
    act(() => h.result.current.scrollToLatest())
    expect(h.list.scrollToEnd).toHaveBeenLastCalledWith({ animated: true })
    act(() => h.result.current.onLayout(layout(700)))
    h.flush()
    expect(h.list.scrollToEnd).toHaveBeenLastCalledWith({ animated: false })
  })

  it('cancels queued scroll work when leaving the conversation', () => {
    const h = setup()
    h.mount()
    h.list.scrollToEnd.mockClear()
    act(() => h.result.current.onLayout(layout(280)))
    h.unmount()
    h.flush()
    expect(h.list.scrollToEnd).not.toHaveBeenCalled()
  })
})
