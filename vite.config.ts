import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/hex/',
  resolve: {
    alias: {
      'zustand/react': new URL('./src/ui/zustandReactStub.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,mjs}'],
    setupFiles: ['tests/browserGlobals.ts', 'tests/setup.ts'],
  },
});
