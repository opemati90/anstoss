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
