jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

jest.mock('react-native/src/private/animated/NativeAnimatedHelper')

const originalConsoleError = console.error
console.error = (...args) => {
  const firstArg = typeof args[0] === 'string' ? args[0] : ''

  if (firstArg.includes('not wrapped in act')) {
    return
  }

  originalConsoleError(...args)
}
