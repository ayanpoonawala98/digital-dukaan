import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import './polish.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

// Keep the free API host awake while someone has the app open (cold starts take ~10s).
{ const ping = () => { if (document.visibilityState === 'visible') fetch(`${import.meta.env.VITE_API_URL || ''}/api/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); };
  ping(); setInterval(ping, 9 * 60 * 1000); document.addEventListener('visibilitychange', ping); }
