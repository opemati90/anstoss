// Exercise the installed SDK helper, not a mock of getExpoPushTokenAsync.
// This guards the patch-package fix that allows native registration recovery.
const mockNativeAcquire = jest.fn()
jest.mock('expo-notifications/build/PushTokenManager', () => ({
  __esModule: true, default: { getDevicePushTokenAsync: () => mockNativeAcquire() },
}))
jest.mock('expo-notifications/src/PushTokenManager', () => ({
  __esModule: true, default: { getDevicePushTokenAsync: () => mockNativeAcquire() },
}))
jest.mock('expo-notifications/build/warnOfExpoGoPushUsage', () => ({ warnOfExpoGoPushUsage: jest.fn() }))
jest.mock('expo-notifications/src/warnOfExpoGoPushUsage', () => ({ warnOfExpoGoPushUsage: jest.fn() }))

import { getDevicePushTokenAsync as builtAcquire } from 'expo-notifications/build/getDevicePushTokenAsync'
import { getDevicePushTokenAsync as sourceAcquire } from 'expo-notifications/src/getDevicePushTokenAsync'

describe.each([
  ['compiled SDK', builtAcquire],
  ['source SDK', sourceAcquire],
] as const)('%s native token recovery', (_, acquire) => {
  beforeEach(() => { jest.useFakeTimers(); mockNativeAcquire.mockReset() })
  afterEach(() => { jest.useRealTimers() })

  it('releases a rejected native request so the next attempt really retries', async () => {
    mockNativeAcquire.mockRejectedValueOnce(new Error('temporary native failure')).mockResolvedValue('fresh-token')
    await expect(acquire()).rejects.toThrow('temporary native failure')
    await expect(acquire()).resolves.toMatchObject({ data: 'fresh-token' })
    expect(mockNativeAcquire).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('coalesces concurrent callers and releases their shared timeout', async () => {
    mockNativeAcquire.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue('fresh-token')
    const first = acquire().catch(error => error)
    const second = acquire().catch(error => error)
    expect(mockNativeAcquire).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(15_000)
    expect(await first).toMatchObject({ code: 'ERR_NOTIFICATIONS_NATIVE_TOKEN_TIMEOUT' })
    expect(await second).toMatchObject({ code: 'ERR_NOTIFICATIONS_NATIVE_TOKEN_TIMEOUT' })
    await expect(acquire()).resolves.toMatchObject({ data: 'fresh-token' })
    expect(mockNativeAcquire).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each(['resolve', 'reject'])('ignores late %s from an expired request while a new one is pending', async outcome => {
    let resolveOld!: (token: string) => void
    let rejectOld!: (error: Error) => void
    let resolveNew!: (token: string) => void
    mockNativeAcquire.mockImplementationOnce(() => new Promise((resolve, reject) => {
      resolveOld = resolve; rejectOld = reject
    })).mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
    const old = acquire().catch(error => error)
    await jest.advanceTimersByTimeAsync(15_000)
    expect(await old).toMatchObject({ code: 'ERR_NOTIFICATIONS_NATIVE_TOKEN_TIMEOUT' })
    const next = acquire()
    if (outcome === 'resolve') resolveOld('stale-token')
    else rejectOld(new Error('late native rejection'))
    await Promise.resolve()
    const concurrent = acquire()
    expect(mockNativeAcquire).toHaveBeenCalledTimes(2)
    resolveNew('current-token')
    await expect(next).resolves.toMatchObject({ data: 'current-token' })
    await expect(concurrent).resolves.toMatchObject({ data: 'current-token' })
    expect(jest.getTimerCount()).toBe(0)
  })
})
