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
    global: {
      branches: 60,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },
  testEnvironment: 'node',
  watchman: false,
  moduleNameMapper: {
    '^@anstoss/shared$': '<rootDir>/../../../packages/shared/src',
  },
}

export default config
