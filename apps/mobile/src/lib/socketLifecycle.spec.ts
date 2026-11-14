import { AppState } from 'react-native'
import { bindSocketLifecycle } from './socketLifecycle'

jest.mock('../auth/accessChanges', () => ({ notifyAccessChanged: jest.fn() }))

describe('socket foreground recovery', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })
  function setup() {
    let onState: (state: string) => void = () => undefined
    let onDisconnect: (reason: string) => void = () => undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
      onState = cb as typeof onState
      return { remove: jest.fn() }
    })
    const socket = { connected: false, connect: jest.fn(), off: jest.fn(), on: jest.fn((_event, cb) => { onDisconnect = cb }) }
    const refresh = jest.fn()
    const dispose = bindSocketLifecycle(socket as never, refresh)
    return { socket, refresh, dispose, change: (state: string) => onState(state), disconnect: (reason: string) => onDisconnect(reason) }
  }
  it('reconnects after a server-driven access refresh and refreshes history on foreground', () => {
    const s = setup()
    s.disconnect('io server disconnect')
    jest.advanceTimersByTime(1000)
    expect(s.socket.connect).toHaveBeenCalledTimes(1)
    s.socket.connected = true
    s.change('active')
    expect(s.refresh).toHaveBeenCalledTimes(1)
    s.dispose()
  })
  it('does not reconnect an unmounted/signed-out socket', () => {
    const s = setup()
    s.disconnect('io server disconnect')
    s.dispose()
    jest.advanceTimersByTime(2000)
    s.change('active')
    expect(s.socket.connect).not.toHaveBeenCalled()
  })
})
