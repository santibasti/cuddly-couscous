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

/* The browser fires `beforeinstallprompt` once, early (often on the login page) — keep it at module level so it is never missed. */
let deferred: InstallEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; notify(); });
}
function useDeferred() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { ev: deferred, installed: installed || isStandalone() };
}

/** Always-available "Install app" button (sidebar / login). Uses the native prompt when the browser offers it, otherwise shows the browser-specific steps. */
export function InstallButton({ className = 'btn sm block' }: { className?: string }) {
  const { ev, installed: done } = useDeferred();
  const [help, setHelp] = useState(false);
  if (done) return null;
  const go = async () => {
    if (!ev) { setHelp((v) => !v); return; }
    await ev.prompt(); await ev.userChoice.catch(() => undefined); deferred = null; notify();
  };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const how = isIOS() ? <>Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</>
    : /firefox/i.test(ua) ? <>Firefox on a computer cannot install web apps. Open TopMop in <b>Chrome</b> or <b>Edge</b>, or on a phone use the menu → <b>Install</b>.</>
    : <>In Chrome or Edge, open the browser menu (⋮) and choose <b>Install TopMop</b> / <b>Add to Home screen</b>, or click the install icon at the right of the address bar. If it is not listed, reload this page once (Ctrl+Shift+R) and use the HTTPS address.</>;
  return (
    <div>
      <button className={className} onClick={go} style={{ marginTop: 8 }}><Icon name="download" /><span className="lbl">Install app</span></button>
      {help && !ev && <div className="small" style={{ marginTop: 6 }}>{how}</div>}
    </div>
  );
}

export function InstallPrompt() {
  const { ev, installed: done } = useDeferred();
  const [hidden, setHidden] = useState(() => dismissedRecently());
  const [steps, setSteps] = useState(false);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* noop */ } };
  const ios = isIOS();
  if (done || hidden || (!ev && !ios)) return null;
  const install = async () => {
    if (!ev) return;
    await ev.prompt();
    const r = await ev.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferred = null; notify(); if (r.outcome === 'accepted') setHidden(true); else dismiss();
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
