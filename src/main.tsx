import './polyfills';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './components/InstallPrompt';
import { startGeocoder } from './lib/geocode';
import { applyTheme } from './lib/theme';
import { BUILD, forceUpdate, startUpdateWatcher } from './lib/updater';
import { CLOUD } from './lib/cloud';
applyTheme();

if (import.meta.env.PROD) startUpdateWatcher();

// offline-capable app shell (production builds only, so dev hot-reload is not cached)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => { setInterval(() => { reg.update().catch(() => undefined); }, 300000); window.addEventListener('focus', () => { reg.update().catch(() => undefined); }); }).catch(() => { /* not available (e.g. insecure origin) */ });
    // a new version took over after this page was already open: offer a reload (never reload by surprise — someone may be mid-form)
    let seen = had;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (seen) window.dispatchEvent(new Event('topmop:update-ready')); seen = true; });
  });
}

/** Shows the error on screen (instead of a blank page) if something throws while drawing. */
class Boundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err; const stack = (e.stack ?? '').split('\n').slice(0, 8).join('\n');
    return (
      <div style={{ font: '14px system-ui', padding: 20, maxWidth: 720, color: '#0b1b2e' }}>
        <h2 style={{ color: '#fff' }}>Something went wrong</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f3f6f9', color: '#0b1b2e', padding: 12, borderRadius: 8, fontSize: 12 }}>{e.message}{'\n\n'}{stack}{'\n\n'}Build {BUILD}</pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => location.reload()}>Reload</button>
          <button onClick={() => void forceUpdate()}>Update now (clear saved app copies)</button>
          {!CLOUD && <button onClick={() => { try { localStorage.clear(); } catch { /* ignore */ } location.reload(); }}>Clear saved demo data and reload</button>}
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <HashRouter>
        <App />
      </HashRouter>
    </Boundary>
  </StrictMode>,
);

startGeocoder();
