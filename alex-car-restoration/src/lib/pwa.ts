import { useEffect, useState } from 'react';

/** Registers the service worker (production builds only) and reports when a new version is waiting. */
export function registerServiceWorker(onUpdate: (activate: () => void) => void) {
  if (!import.meta.env.PROD || import.meta.env.VITE_ROUTER === 'memory' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const announce = (worker: ServiceWorker) => onUpdate(() => worker.postMessage('SKIP_WAITING'));
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) { reloaded = true; window.location.reload(); }
      });
    } catch {
      /* offline support is optional; the app still works without it */
    }
  });
}

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);

/** Install state for the "Install app" button. iOS has no install prompt, so it gets a how-to hint instead. */
export function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return {
    installed,
    canPrompt: !!event && !installed,
    iosHint: !installed && !event && isIos(),
    install: async () => { if (!event) return; await event.prompt(); await event.userChoice; setEvent(null); },
  };
}
