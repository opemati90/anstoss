import React, { useState } from 'react'
import { FlatList } from 'react-native'
import { render, act } from '@testing-library/react-native'

// ScrollPickerColumn reads useClubColors() for text colors only.
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ textTertiary: '#999', textPrimary: '#111' }),
}))

import { ScrollPicker } from '../ScrollPicker'

const ITEM_HEIGHT = 44
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

function Harness({ onSelectSpy }: { onSelectSpy: (i: number) => void }) {
  const [idx, setIdx] = useState(2)
  return (
    <ScrollPicker
      primaryColor="#000000"
      columns={[
        {
          items: DAYS,
          selectedIndex: idx,
          onSelect: (i) => {
            onSelectSpy(i)
            setIdx(i)
          },
        },
      ]}
    />
  )
}

function fireMomentum(flatListNode: { props: Record<string, unknown> }, index: number) {
  const handler = flatListNode.props.onMomentumScrollEnd as
    | ((e: { nativeEvent: { contentOffset: { y: number } } }) => void)
    | undefined
  act(() => {
    handler?.({ nativeEvent: { contentOffset: { y: index * ITEM_HEIGHT } } })
  })
}

describe('ScrollPicker (controlled wheel)', () => {
  it('renders all columns without throwing', () => {
    const screen = render(
      <ScrollPicker
        primaryColor="#000000"
        columns={[
          { items: DAYS, selectedIndex: 0, onSelect: jest.fn() },
          { items: ['Jan', 'Feb', 'Mar'], selectedIndex: 1, onSelect: jest.fn() },
        ]}
      />,
    )
    expect(screen.UNSAFE_getAllByType(FlatList)).toHaveLength(2)
  })

  it('does NOT re-scroll on the controlled echo of the user\'s own selection (freeze-loop guard)', () => {
    // THE regression: user fling → onSelect → parent setState → selectedIndex
    // prop echo → effect → programmatic scrollToOffset → (on device) momentum
    // re-emit → onSelect → … unbounded loop that OOM-crashes the app. The
    // lastUserIndex guard must suppress the programmatic scroll for the user's
    // OWN selection. Pre-fix (no guard) the effect calls scrollToOffset on the
    // echo and this assertion fails.
    const onSelectSpy = jest.fn()
    const screen = render(<Harness onSelectSpy={onSelectSpy} />)

    const flatList = screen.UNSAFE_getByType(FlatList)
    // Spy on the real instance method the effect calls via flatListRef.current.
    const instance = flatList.instance as unknown as { scrollToOffset: () => void }
    const scrollSpy = jest
      .spyOn(instance, 'scrollToOffset')
      .mockImplementation(() => {})

    fireMomentum(flatList, 6)

    expect(onSelectSpy).toHaveBeenCalledTimes(1)
    expect(onSelectSpy).toHaveBeenCalledWith(6)
    // The controlled echo of the user's own selection must NOT re-scroll.
    expect(scrollSpy).not.toHaveBeenCalled()

    scrollSpy.mockRestore()
  })

  it('ignores a momentum-end on the already-selected index (no spurious onSelect)', () => {
    const onSelectSpy = jest.fn()
    const screen = render(<Harness onSelectSpy={onSelectSpy} />)
    fireMomentum(screen.UNSAFE_getByType(FlatList), 2)
    expect(onSelectSpy).not.toHaveBeenCalled()
  })
})
