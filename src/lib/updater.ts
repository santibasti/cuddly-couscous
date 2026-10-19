// Keeps the open app current: asks the server which build is live and tells the page when it is newer than the one running.
// (The service worker also renews itself on every deploy; this check covers an app that is simply left open.)
declare const __BUILD_ID__: string;
const CURRENT = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

async function liveId(): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: string }; return typeof j.id === 'string' ? j.id : null;
  } catch { return null; }   // offline: try again later
}

let announced = false;
export async function checkForUpdate() {
  if (announced || CURRENT === 'dev') return;
  const id = await liveId();
  if (id && id !== CURRENT) { announced = true; window.dispatchEvent(new Event('topmop:update-ready')); }
}

/** Looks for a new version every minute, whenever the app comes back to the front, and when the connection returns. */
export function startUpdateWatcher() {
  if (CURRENT === 'dev') return;
  setInterval(() => { if (document.visibilityState === 'visible') void checkForUpdate(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  window.addEventListener('online', () => void checkForUpdate());
  window.addEventListener('focus', () => void checkForUpdate());
  void checkForUpdate();
}

/** The build this page is running (shown in the footer so it is easy to compare with the live one). */
export const BUILD = CURRENT;
/** Throw away every saved copy of the app (service worker + caches) and load the live version. Signed-in data is kept. */
export async function forceUpdate() {
  try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs ?? []).map((r) => r.unregister())); } catch { /* none */ }
  try { const keys = await caches?.keys?.(); await Promise.all((keys ?? []).map((k) => caches.delete(k))); } catch { /* none */ }
  location.replace(`${location.pathname}?v=${Date.now()}${location.hash}`);
}
