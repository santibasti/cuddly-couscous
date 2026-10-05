// Dark (default) / light appearance, remembered on this device.
export type Theme = 'dark' | 'light';
const KEY = 'topmop-theme';
export const getTheme = (): Theme => { try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
export function applyTheme(t: Theme = getTheme()) {
  document.body.classList.toggle('dark', t === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#081a33' : '#0B2545');
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* not saved */ } applyTheme(t); }
