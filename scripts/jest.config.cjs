/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
}
