import React, { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { ot } from '../../shared/lib/owner-i18n.js';
import { imageSrc } from '../../shared/lib/api.js';

// Same install mechanism as the storefront (browser install prompt, or Add to Home screen steps), but the installed app is this
// store's dashboard: its own name and logo, opening straight to /dashboard for this store.
const pngIcon = (logo, size) => {
  try {
    const u = new URL(imageSrc(logo), location.origin);
    if (u.protocol === 'https:' && u.hostname === 'ik.imagekit.io' && !u.searchParams.has('tr')) u.searchParams.set('tr', `w-${size},h-${size},c-at_max,f-png`);
    return u.href;
  } catch { return ''; }
};
export function adminManifest(business, origin) {
  const name = String(business?.name || 'Digital Shop').trim() || 'Digital Shop';
  const icons = business?.logoUrl && pngIcon(business.logoUrl, 192)
    ? [{ src: pngIcon(business.logoUrl, 192), sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: pngIcon(business.logoUrl, 512), sizes: '512x512', type: 'image/png', purpose: 'any' }]
    : [{ src: `${origin}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }];
  return { id: `${origin}/dashboard?store=${business?.id}`, name: `${name} Admin`.slice(0, 45), short_name: name.slice(0, 12), description: `${name} dashboard`, start_url: `${origin}/dashboard?store=${business?.id}`, scope: `${origin}/`, display: 'standalone', orientation: 'portrait', background_color: '#f8f5ee', theme_color: business?.accentColor || '#0e9f6e', lang: 'en', icons };
}

export default function InstallAdminApp({ business }) {
  const [prompt, setPrompt] = useState(null), [busy, setBusy] = useState(false), [instructions, setInstructions] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const manifest = useMemo(() => (business ? adminManifest(business, location.origin) : null), [business?.id, business?.name, business?.logoUrl, business?.accentColor]);
  useEffect(() => {
    const capture = event => { event.preventDefault(); setPrompt(event); };
    const finish = () => { setInstalled(true); setPrompt(null); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', finish);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', finish); };
  }, []);
  // While the dashboard is open the page's manifest describes this store's admin app; the original is restored on leave.
  useEffect(() => {
    if (!manifest) return undefined;
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return undefined;
    const original = link.getAttribute('href');
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    link.setAttribute('href', url);
    return () => { link.setAttribute('href', original); URL.revokeObjectURL(url); };
  }, [manifest]);
  if (installed || !business) return null;
  const install = async () => {
    if (!prompt) { setInstructions(v => !v); return; }
    setBusy(true);
    try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setInstructions(true); }
    finally { setBusy(false); }
  };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const name = business.name || 'Digital Shop';
  return <section className="install-admin" aria-label={ot("Install your admin app")}>
    <span className="install-admin-logo" aria-hidden="true">{business.logoUrl ? <img src={pngIcon(business.logoUrl, 192) || imageSrc(business.logoUrl)} alt="" width="52" height="52"/> : <b>{name.slice(0, 1).toUpperCase()}</b>}</span>
    <div className="install-admin-text"><strong>{ot("{v0} Admin", { v0: name })}</strong><span>{ot("Add your dashboard to your home screen and open it in one tap.")}</span></div>
    <button type="button" className="btn btn-green" disabled={busy} onClick={install} aria-expanded={instructions}><Download size={16}/> {busy ? ot("Opening install...") : ot("Download app")}</button>
    {instructions && <div className="install-guide install-admin-guide" role="status"><strong>{ot("Put {v0} on your home screen", { v0: name })}</strong><span>{ios ? ot("In Safari, tap Share, then Add to Home Screen.") + " " + ot("On iPhone the app may appear as Digital Shop.") : ot("In your browser menu, choose Install app or Add to Home screen.")}</span><button type="button" onClick={() => setInstructions(false)} aria-label={ot("Close install instructions")}><X size={15}/></button></div>}
  </section>;
}
