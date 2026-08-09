import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  envDir: '../..',
  resolve: { alias: { '@bolb23/game-client-sdk': fileURLToPath(new URL('../../packages/game-client-sdk/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom' },
});
