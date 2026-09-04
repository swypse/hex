import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/hex/',
  resolve: {
    alias: {
      'zustand/react': new URL('./src/ui/zustandReactStub.ts', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
