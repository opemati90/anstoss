const mockAsyncStorageStore = new Map()
const mockAsyncStorage = {
  getItem: jest.fn((key) =>
    Promise.resolve(mockAsyncStorageStore.has(key) ? mockAsyncStorageStore.get(key) : null),
  ),
  setItem: jest.fn((key, value) => {
    mockAsyncStorageStore.set(key, value)
    return Promise.resolve()
  }),
  removeItem: jest.fn((key) => {
    mockAsyncStorageStore.delete(key)
    return Promise.resolve()
  }),
  clear: jest.fn(() => {
    mockAsyncStorageStore.clear()
    return Promise.resolve()
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Array.from(mockAsyncStorageStore.keys()))),
  multiGet: jest.fn((keys) =>
    Promise.resolve(
      keys.map((key) => [
        key,
        mockAsyncStorageStore.has(key) ? mockAsyncStorageStore.get(key) : null,
      ]),
    ),
  ),
  multiSet: jest.fn((entries) => {
    entries.forEach(([key, value]) => mockAsyncStorageStore.set(key, value))
    return Promise.resolve()
  }),
  multiRemove: jest.fn((keys) => {
    keys.forEach((key) => mockAsyncStorageStore.delete(key))
    return Promise.resolve()
  }),
  mergeItem: jest.fn((key, value) => {
    mockAsyncStorageStore.set(key, value)
    return Promise.resolve()
  }),
  __INTERNAL_MOCK_STORAGE__: mockAsyncStorageStore,
}

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
  ...mockAsyncStorage,
}))

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (component) => component,
}))

if (typeof global.window === 'undefined') {
  global.window = global
}

if (typeof global.window.dispatchEvent !== 'function') {
  global.window.dispatchEvent = jest.fn()
}

if (typeof global.window.addEventListener !== 'function') {
  global.window.addEventListener = jest.fn()
}

if (typeof global.window.removeEventListener !== 'function') {
  global.window.removeEventListener = jest.fn()
}

global.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('react-native/src/private/animated/NativeAnimatedHelper')

// Keep RN Animated from leaving timers behind after Jest tears down a test file.
const { Animated } = require('react-native')

const immediateAnimation = (animations = []) => ({
  start: (callback) => {
    animations.forEach((animation) => animation?.start?.())
    callback?.({ finished: true })
  },
  stop: () => {
    animations.forEach((animation) => animation?.stop?.())
  },
  reset: () => {
    animations.forEach((animation) => animation?.reset?.())
  },
})

Animated.timing = jest.fn(() => immediateAnimation())
Animated.spring = jest.fn(() => immediateAnimation())
Animated.decay = jest.fn(() => immediateAnimation())
Animated.sequence = jest.fn((animations) => immediateAnimation(animations))
Animated.parallel = jest.fn((animations) => immediateAnimation(animations))
Animated.stagger = jest.fn((_time, animations) => immediateAnimation(animations))
Animated.loop = jest.fn((animation) => immediateAnimation([animation]))

const originalConsoleError = console.error
console.error = (...args) => {
  const firstArg = typeof args[0] === 'string' ? args[0] : ''

  if (firstArg.includes('not wrapped in act')) {
    return
  }

  originalConsoleError(...args)
}

// Chat revamp: native keyboard tracking. The package ships its own jest mock
// (KeyboardProvider, KeyboardAvoidingView, KeyboardStickyView render children).
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
)

// Chat revamp: reanimated (layout animations, swipe-to-reply) and gesture
// handler run on their official jest mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock')
  return { ...mock, useReducedMotion: () => false, default: mock.default }
})
require('react-native-gesture-handler/jestSetup')

// 2026-11 redesign: offline banner (netinfo) and MyDues copy pills (clipboard).
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
)
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }))

// Matchday Studio: PNG capture and the native share sheet.
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///tmp/studio-graphic.png')),
}))
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}))
