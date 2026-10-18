import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

/** Every build gets an id. The app asks the server for version.json and reloads itself when the id changed; the service worker's cache name follows it so the offline copy renews on every deploy. */
const BUILD_ID = Date.now().toString(36);
const buildInfo = () => ({
  name: 'topmop-build-info',
  apply: 'build' as const,
  closeBundle() {
    const dist = path.resolve(import.meta.dirname, 'dist');
    try { fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ id: BUILD_ID, at: new Date().toISOString() })); } catch { /* nothing to write into */ }
    try { const f = path.join(dist, 'sw.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/topmop-shell-[\w-]+/, `topmop-shell-${BUILD_ID}`)); } catch { /* no service worker in this build */ }
  },
});

export default defineConfig({
  plugins: [react(), buildInfo()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  build: { chunkSizeWarningLimit: 1500, target: ['es2020', 'chrome87', 'safari14', 'firefox78'] },
});
