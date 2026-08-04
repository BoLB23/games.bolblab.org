import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  resolve: { alias: { '@game-platform/game-client-sdk': fileURLToPath(new URL('../../packages/game-client-sdk/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true },
});
