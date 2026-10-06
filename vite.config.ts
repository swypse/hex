import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/hex/' : '/',
  resolve: {
    alias: {
      '@enums': new URL('./src/enums/index.ts', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname,
      'zustand/react': new URL('./src/util/zustand-react-stub', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,mjs}'],
    setupFiles: ['tests/browser-globals.ts', 'tests/setup.ts'],
  },
}));
