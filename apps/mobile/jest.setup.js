jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

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
