import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { StyleSheet, TextInput } from 'react-native'
import { api } from '../../api/client'
import { BottomSheet, Button } from '../ui'
import { ComposeSheet } from './ComposeSheet'

jest.mock('../../api/client', () => ({ api: jest.fn() }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ primary: '#111111', surface: '#ffffff', error: '#aa0000' }),
}))

const props = {
  visible: true,
  clubId: 'club-1',
  teamId: 'team-1',
  channelId: 'channel-1',
  locale: 'en',
  onClose: jest.fn(),
  onAction: jest.fn(),
  onPosted: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(api).mockReset()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure })
  return { promise, resolve, reject }
}

function fillPoll(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByText('chat.compose.poll'))
  screen.UNSAFE_getAllByType(TextInput).forEach((input, index) =>
    fireEvent.changeText(input, index === 0 ? 'When?' : `Choice ${index}`),
  )
}

describe('ComposeSheet bounded body', () => {
  it('keeps navigation outside a shrinkable body without duplicate keyboard insets', () => {
    const screen = render(<ComposeSheet {...props} />)
    const scroll = screen.getByTestId('chat-compose-scroll')
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 })
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false)
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled')
    expect(within(scroll).queryByLabelText('common.cancel')).toBeNull()
    fireEvent.press(screen.getByLabelText('common.cancel'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps all six poll options and submission in the scroll body and posts their values', async () => {
    const created = { id: 'poll-message' }
    jest.mocked(api).mockResolvedValueOnce(created)
    const screen = render(<ComposeSheet {...props} />)
    fireEvent.press(screen.getByText('chat.compose.poll'))
    for (let index = 0; index < 4; index++) {
      fireEvent.press(screen.getByLabelText('chat.compose.addOption'))
    }
    const body = within(screen.getByTestId('chat-compose-scroll'))
    // This is a containment/interaction regression, not native pixel evidence.
    const inputs = body.UNSAFE_getAllByType(TextInput)
    expect(inputs).toHaveLength(7)
    inputs.forEach((input, index) => fireEvent.changeText(input, index === 0 ? 'When?' : `Choice ${index}`))
    expect(body.queryByLabelText('chat.compose.addOption')).toBeNull()
    fireEvent.press(body.getByText('chat.compose.postPoll'))
    await waitFor(() => expect(props.onPosted).toHaveBeenCalledWith(created))
    expect(api).toHaveBeenCalledWith('/teams/team-1/messages/poll', {
      method: 'POST',
      body: { question: 'When?', options: ['Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Choice 5', 'Choice 6'], channelId: 'channel-1' },
    })
  })

  it('ignores an event response from a closed sheet when a newer request is pending', async () => {
    const oldRequest = deferred<unknown[]>()
    const newRequest = deferred<unknown[]>()
    jest.mocked(api).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const screen = render(<ComposeSheet {...props} />)
    fireEvent.press(screen.getByText('chat.compose.shareEvent'))
    screen.rerender(<ComposeSheet {...props} visible={false} />)
    screen.rerender(<ComposeSheet {...props} />)
    fireEvent.press(screen.getByText('chat.compose.shareEvent'))
    await act(async () => oldRequest.resolve([{ id: 'old', title: 'Stale event', date: '2026-12-01T12:00:00Z' }]))
    expect(screen.queryByText('Stale event')).toBeNull()
    expect(screen.getByText('common.loading')).toBeTruthy()
    await act(async () => newRequest.resolve([{ id: 'new', title: 'Current event', date: '2026-12-02T12:00:00Z' }]))
    expect(screen.getByText('Current event')).toBeTruthy()
  })

  it('locks same-frame submission and disables Back while posting', async () => {
    const request = deferred<unknown>()
    jest.mocked(api).mockReturnValueOnce(request.promise)
    const screen = render(<ComposeSheet {...props} />)
    fillPoll(screen)
    const submit = screen.UNSAFE_getByType(Button).props.onPress
    act(() => { submit(); submit() })
    expect(api).toHaveBeenCalledTimes(1)
    expect(screen.UNSAFE_getByType(BottomSheet).props.dismissible).toBe(false)
    expect(screen.getByLabelText('common.back')).toBeDisabled()
    fireEvent.press(screen.getByLabelText('common.back'))
    expect(screen.queryByText('chat.compose.shareEvent')).toBeNull()
    await act(async () => request.resolve({ id: 'posted' }))
  })

  it('delivers a committed message but does not close a newly reopened draft', async () => {
    const request = deferred<unknown>()
    jest.mocked(api).mockReturnValueOnce(request.promise)
    const screen = render(<ComposeSheet {...props} />)
    fillPoll(screen)
    fireEvent.press(screen.getByText('chat.compose.postPoll'))
    screen.rerender(<ComposeSheet {...props} visible={false} />)
    screen.rerender(<ComposeSheet {...props} />)
    fillPoll(screen)
    await act(async () => request.resolve({ id: 'committed' }))
    expect(props.onPosted).toHaveBeenCalledWith({ id: 'committed' })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.UNSAFE_getAllByType(TextInput)[0].props.value).toBe('When?')
  })

  it('ignores an old failure after reopening and permits retry in the new session', async () => {
    const request = deferred<unknown>()
    jest.mocked(api).mockReturnValueOnce(request.promise).mockResolvedValueOnce({ id: 'retry' })
    const screen = render(<ComposeSheet {...props} />)
    fillPoll(screen)
    fireEvent.press(screen.getByText('chat.compose.postPoll'))
    screen.rerender(<ComposeSheet {...props} visible={false} />)
    screen.rerender(<ComposeSheet {...props} />)
    fillPoll(screen)
    await act(async () => request.reject(new Error('Old request failed')))
    expect(screen.queryByText('chat.compose.postFailed')).toBeNull()
    fireEvent.press(screen.getByText('chat.compose.postPoll'))
    await waitFor(() => expect(props.onPosted).toHaveBeenCalledWith({ id: 'retry' }))
  })
})
