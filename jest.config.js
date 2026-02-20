module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.property\\.test\\.ts$',
    'rollup\\.service\\.test\\.ts$',
    'encounter-metadata-completeness\\.test\\.ts$',
    'bedrock\\.service\\.test\\.ts$',
    'referral\\.service\\.test\\.ts$',
    'authorizer\\.test\\.ts$',
    'triage\\.service\\.test\\.ts$',
    'auth\\.service\\.test\\.ts$',
    'e2e-smartphone-app\\.test\\.ts$',
    'health-handler\\.test\\.ts$',
    'voice-handler\\.test\\.ts$',
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/tests/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
};
