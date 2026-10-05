import './polyfills';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// offline-capable app shell (production builds only, so dev hot-reload is not cached)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => { setInterval(() => { reg.update().catch(() => undefined); }, 3600000); }).catch(() => { /* not available (e.g. insecure origin) */ });
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
    return <div style={{ font: '14px system-ui', padding: 20, maxWidth: 640 }}><h2>Something went wrong</h2><pre style={{ whiteSpace: 'pre-wrap', background: '#f3f6f9', padding: 12, borderRadius: 8 }}>{this.state.err.message}{'\n\n'}{navigator.userAgent}</pre><button onClick={() => { try { localStorage.clear(); } catch { /* ignore */ } location.reload(); }}>Clear saved demo data and reload</button></div>;
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
