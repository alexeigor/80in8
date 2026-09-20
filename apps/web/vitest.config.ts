import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_ID__: JSON.stringify('test'),
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  resolve: {
    alias: {
      '@80in8/core': here('../../packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // DESIGN.md §9.1 asks for at least 80% of lines; the suite sits well above that,
    // and the thresholds hold the ground it has taken. `main.tsx` is the bootstrap
    // and only runs in a browser.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/globals.d.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
})
