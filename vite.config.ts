import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  build: { chunkSizeWarningLimit: 1500, target: ['es2020', 'chrome87', 'safari14', 'firefox78'] },
});
