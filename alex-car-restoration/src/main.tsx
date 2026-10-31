import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import { RoleProvider } from './lib/role';
import { StoreProvider } from './lib/store';
import { registerServiceWorker } from './lib/pwa';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoleProvider>
      <StoreProvider>
        {import.meta.env.VITE_ROUTER === 'memory' ? <MemoryRouter><App /></MemoryRouter> : <HashRouter><App /></HashRouter>}
      </StoreProvider>
    </RoleProvider>
  </StrictMode>,
);

registerServiceWorker((activate) => window.dispatchEvent(new CustomEvent('acr-update', { detail: activate })));
