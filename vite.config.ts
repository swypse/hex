import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/hex/' : '/',
  resolve: {
    alias: {
      'zustand/react': new URL('./src/ui/zustand-react-stub', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,mjs}'],
    setupFiles: ['tests/browser-globals.ts', 'tests/setup.ts'],
  },
}));
