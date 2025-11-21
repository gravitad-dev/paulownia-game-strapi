const { createDefaultPreset } = require('ts-jest')
const tsJestPreset = createDefaultPreset()

module.exports = {
  ...tsJestPreset,
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: false,
  maxWorkers: 1,
  testTimeout: 60000
}