import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Node environment for server-action tests (DB access)
    environment: 'node',
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Only run web-review tests
    include: ['src/**/*.test.ts'],
    // Longer timeout for DB integration tests
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
