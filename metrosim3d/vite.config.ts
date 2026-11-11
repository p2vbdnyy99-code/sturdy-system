/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built game run from any sub-path (GitHub Pages, a USB stick, a LAN folder).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  server: { host: true, port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
