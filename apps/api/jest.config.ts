import type { Config } from 'jest'

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    // Baseline coverage for the current API test suite. Raise these as API
    // coverage expands; keeping them explicit still prevents regressions.
    global: {
      branches: 22,
      functions: 22,
      lines: 25,
      statements: 25,
    },
  },
  testEnvironment: 'node',
  watchman: false,
  moduleNameMapper: {
    '^@anstoss/shared$': '<rootDir>/../../../packages/shared/src',
  },
}

export default config
