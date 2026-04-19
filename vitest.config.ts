import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'engine'),
      '@instances': path.resolve(__dirname, 'instances'),
    },
  },
  test: {
    include: ['engine/__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
