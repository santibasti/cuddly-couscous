import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
const pngSize = (file: string) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('installable app', () => {
  it('has what browsers need to offer "Install app"', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });
  it('points at icon files that exist and match their declared size', () => {
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const file = resolve(root, 'public', icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file)).toEqual([w, h]);
    }
  });
  it('links the manifest and iOS icon from the page, with the colour set to the app theme', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain(`content="${manifest.theme_color}"`);
    expect(existsSync(resolve(root, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });
  it('ships a service worker that never touches non-GET requests and cleans up old caches', () => {
    const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
    expect(sw).toContain("req.method !== 'GET'");
    expect(sw).toContain('caches.delete');
    expect(sw).toContain('SKIP_WAITING');
  });
});
