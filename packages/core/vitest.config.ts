import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Anchored to this file rather than the working directory, so the same config works
// when the suite is driven from the repository root (mutation testing does that).
const packageRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: packageRoot,
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
