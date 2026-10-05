// "Install TopMop" prompt (Android / Chrome / Edge: one tap; iPhone / iPad: how to Add to Home Screen) and the "new version ready" banner.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const KEY = 'topmop-install-dismissed';
const DAYS = 14;

export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
/** iPhone, iPad (including iPadOS, which reports itself as a Mac) — Safari has no install button, so we show the steps. */
export const isIOS = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const dismissedRecently = () => { try { const t = Number(localStorage.getItem(KEY)); return !!t && Date.now() - t < DAYS * 86400000; } catch { return false; } };

export function InstallPrompt() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(() => isStandalone() || dismissedRecently());
  const [steps, setSteps] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    const onInstalled = () => { setEv(null); setHidden(true); };
    window.addEventListener('beforeinstallprompt', onPrompt); window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* noop */ } };
  const ios = isIOS();
  if (hidden || (!ev && !ios)) return null;
  const install = async () => {
    if (!ev) return;
    await ev.prompt();
    const r = await ev.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    setEv(null); if (r.outcome === 'accepted') setHidden(true); else dismiss();
  };
  return (
    <div className="installbar no-print" role="region" aria-label="Install TopMop">
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Install TopMop on this {ios ? (/ipad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1 ? 'iPad' : 'iPhone') : 'device'}</b>
        <div className="small">{steps && ios
          ? <>Tap the <b>Share</b> button <span aria-hidden="true">⎋</span> in Safari, then <b>Add to Home Screen</b>, then <b>Add</b>.</>
          : 'Opens full screen like an app, keeps working with weak signal, and syncs your changes when you are back online.'}</div>
      </div>
      {ev ? <button className="btn primary sm" onClick={install}><Icon name="download" />Install</button> : <button className="btn primary sm" onClick={() => setSteps((v) => !v)}>{steps ? 'Got it' : 'How?'}</button>}
      <button className="btn sm" onClick={dismiss} aria-label="Not now">Not now</button>
    </div>
  );
}

/** Shown when a newer version of the app has been downloaded in the background. */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const h = () => setReady(true); window.addEventListener('topmop:update-ready', h); return () => window.removeEventListener('topmop:update-ready', h); }, []);
  if (!ready) return null;
  return (
    <div className="installbar update no-print" role="status">
      <div style={{ flex: 1 }}><b>A new version of TopMop is ready.</b><div className="small">Reload to use it. Your unsent changes and drafts are kept.</div></div>
      <button className="btn primary sm" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
