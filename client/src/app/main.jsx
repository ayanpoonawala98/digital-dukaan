import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import './polish.css';
import './ui-polish.css';
import { reloadForNewBuild } from '../shared/lib/chunk-reload.js';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);

// Vite fires this when a preloaded chunk 404s after a deploy.
window.addEventListener('vite:preloadError', e => { if (reloadForNewBuild()) e.preventDefault(); });

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

// Keep the free API host awake while someone has the app open (cold starts take ~10s).
{ const ping = () => { if (document.visibilityState === 'visible') fetch(`${import.meta.env.VITE_API_URL || ''}/api/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); };
  ping(); setInterval(ping, 9 * 60 * 1000); document.addEventListener('visibilitychange', ping); }
