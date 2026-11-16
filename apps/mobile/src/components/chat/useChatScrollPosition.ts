import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native'

const BOTTOM_THRESHOLD = 80

/** Chronological-list anchoring, independent of the keyboard's animation driver. */
export function useChatScrollPosition<Row>({
  listRef,
  ready,
  initialUnreadIndex,
  onAtBottomChange,
}: {
  listRef: RefObject<FlatList<Row> | null>
  ready: boolean
  initialUnreadIndex: number
  onAtBottomChange: (value: boolean) => void
}) {
  const initialized = useRef(false)
  const followingLatest = useRef(true)
  const viewportHeight = useRef(0)
  const contentHeight = useRef(0)
  const frame = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const scrollToLatest = useCallback(
    (animated = true) => {
      followingLatest.current = true
      onAtBottomChange(true)
      // FlatList.scrollToEnd uses the last cell's estimated frame, omitting
      // content-container bottom padding and sometimes lagging keyboard resize.
      // Native content/viewport measurements include the complete scroll extent.
      listRef.current?.scrollToOffset({
        offset: Math.max(0, contentHeight.current - viewportHeight.current),
        animated,
      })
    },
    [listRef, onAtBottomChange],
  )

  const followAfterLayout = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (followingLatest.current) scrollToLatest(false)
    })
  }, [scrollToLatest])

  const positionInitialHistory = useCallback(() => {
    if (!ready || initialized.current || viewportHeight.current <= 0 || contentHeight.current <= 0)
      return
    initialized.current = true
    if (initialUnreadIndex >= 0) {
      followingLatest.current = false
      onAtBottomChange(false)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        listRef.current?.scrollToIndex({
          index: initialUnreadIndex,
          viewPosition: 0.1,
          animated: false,
        })
      })
    } else {
      followAfterLayout()
    }
  }, [followAfterLayout, initialUnreadIndex, listRef, onAtBottomChange, ready])

  // History can become ready without changing cached rows' dimensions.
  useEffect(positionInitialHistory, [positionInitialHistory])

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height
      const changed = height !== viewportHeight.current
      viewportHeight.current = height
      if (!initialized.current) positionInitialHistory()
      else if (changed && followingLatest.current) followAfterLayout()
    },
    [followAfterLayout, positionInitialHistory],
  )

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height
      if (!initialized.current) positionInitialHistory()
      else if (followingLatest.current) followAfterLayout()
      // When reading older history, native maintainVisibleContentPosition handles
      // prepends. Never snap the reader to the bottom on a page/reaction update.
    },
    [followAfterLayout, positionInitialHistory],
  )

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!initialized.current) return
      // A content/layout update can emit an intermediate offset before our queued
      // end alignment. That offset is not evidence that the reader scrolled away.
      if (frame.current !== null && followingLatest.current) return
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      // iOS may deliver the resized scroll event BEFORE onLayout. Do not mistake
      // the keyboard shrinking the viewport for a user scrolling away from latest.
      if (Math.abs(layoutMeasurement.height - viewportHeight.current) > 1) {
        viewportHeight.current = layoutMeasurement.height
        if (followingLatest.current) {
          followAfterLayout()
          return
        }
      }
      const bottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_THRESHOLD
      followingLatest.current = bottom
      onAtBottomChange(bottom)
    },
    [followAfterLayout, onAtBottomChange],
  )

  const stopFollowing = useCallback(() => {
    followingLatest.current = false
    onAtBottomChange(false)
  }, [onAtBottomChange])

  return { onLayout, onContentSizeChange, onScroll, scrollToLatest, stopFollowing }
}
