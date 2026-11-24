import { act, render } from '@testing-library/react-native'
import { Animated, Modal, PanResponder, Text, View, type GestureResponderEvent, type PanResponderGestureState } from 'react-native'
import { BottomSheet } from './BottomSheet'

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ background: '#ffffff', borderStrong: '#444444', surfaceOverlay: '#000000' }),
}))

describe('BottomSheet pending-action dismissal', () => {
  it('does not complete an exit that started before dismissal became disabled', () => {
    let completeExit!: (result: { finished: boolean }) => void
    jest.mocked(Animated.timing).mockImplementationOnce(() => ({
      start: callback => { completeExit = callback! },
      stop: jest.fn(),
      reset: jest.fn(),
    }))
    const onClose = jest.fn()
    const screen = render(<BottomSheet visible onClose={onClose}><Text>Draft</Text></BottomSheet>)
    const backdrop = screen.UNSAFE_getAllByType(View).find(view => view.props.onTouchEnd)!
    act(() => backdrop.props.onTouchEnd())
    screen.rerender(<BottomSheet visible dismissible={false} onClose={onClose}><Text>Pending</Text></BottomSheet>)
    act(() => completeExit({ finished: true }))
    expect(onClose).not.toHaveBeenCalled()
    expect(Animated.spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }))
  })

  it('blocks backdrop, hardware Back and drag before animation when dismissal is disabled', () => {
    const create = jest.spyOn(PanResponder, 'create')
    const onClose = jest.fn()
    const screen = render(<BottomSheet visible dismissible={false} onClose={onClose}><Text>Pending</Text></BottomSheet>)
    const handlers = create.mock.calls[0][0]
    expect(screen.UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined()
    expect(screen.UNSAFE_getAllByType(View).filter(view => view.props.onTouchEnd)).toHaveLength(0)
    expect(handlers.onStartShouldSetPanResponder?.({} as GestureResponderEvent, {} as PanResponderGestureState)).toBe(false)
    create.mockRestore()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancels an already started dismiss gesture when posting begins and restores dismissal afterwards', () => {
    const create = jest.spyOn(PanResponder, 'create')
    const onClose = jest.fn()
    const screen = render(<BottomSheet visible onClose={onClose}><Text>Draft</Text></BottomSheet>)
    const handlers = create.mock.calls[0][0]
    const event = {} as GestureResponderEvent
    const gesture = { dy: 150, dx: 0, vy: 1 } as PanResponderGestureState
    expect(handlers.onStartShouldSetPanResponder?.(event, gesture)).toBe(true)
    act(() => handlers.onPanResponderMove?.(event, gesture))
    screen.rerender(<BottomSheet visible dismissible={false} onClose={onClose}><Text>Pending</Text></BottomSheet>)
    jest.mocked(Animated.timing).mockClear()
    act(() => handlers.onPanResponderRelease?.(event, gesture))
    expect(Animated.timing).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    screen.rerender(<BottomSheet visible onClose={onClose}><Text>Retry</Text></BottomSheet>)
    act(() => handlers.onPanResponderRelease?.(event, gesture))
    expect(Animated.timing).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    create.mockRestore()
  })
})
