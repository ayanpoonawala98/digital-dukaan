import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '../../shared/lib/api.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function kotHtml(k) {
  const who = k.orderType === 'dine-in' ? `TABLE ${k.tableNumber}` : `${String(k.orderType || '').toUpperCase()}${k.customerName ? ' - ' + k.customerName : ''}`;
  const head = k.isReprint ? 'KOT (REPRINT)' : k.followUp ? `KOT #${k.kotNo} - NEW ITEMS` : 'KOT';
  const lines = k.lines.map(l => `<div class="l"><b>${l.qty} x ${esc(l.name)}</b>${l.variant ? `<div class="o">(${esc(l.variant)})</div>` : ''}${l.addons.length ? `<div class="o">${l.addons.map(a => '+ ' + esc(a)).join(', ')}</div>` : ''}${(l.answers || []).map(a => `<div class="o">${esc(a)}</div>`).join('')}${l.note ? `<div class="n">NOTE: ${esc(l.note)}</div>` : ''}</div>`).join('');
  const when = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{margin:0;padding:2mm;width:74mm;font:14px/1.35 "Courier New",monospace;color:#000;background:#fff}h1{font-size:15px;text-align:center;margin:0}h2{font-size:20px;text-align:center;margin:4px 0}.c{text-align:center;margin:2px 0}hr{border:0;border-top:1px dashed #000;margin:6px 0}.l{margin:5px 0;font-size:15px}.o{padding-left:14px;font-size:13px}.n{padding-left:14px;font-weight:700}</style></head><body><h1>${esc(k.storeName)}</h1><p class="c">${esc(head)}</p><h2>${esc(who)}</h2><p class="c">Order #${esc(k.orderNumber)} - ${esc(when)}</p><hr>${lines}<hr>${k.note ? `<p><b>ORDER NOTE:</b> ${esc(k.note)}</p>` : ''}</body></html>`;
}
export function printHtml(html) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:200mm;border:0';
  document.body.appendChild(f);
  const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.print(); } setTimeout(() => f.remove(), 60000); };
  if (doc.readyState === 'complete') setTimeout(go, 150); else f.onload = () => setTimeout(go, 150);
}
// Prints new items only (everything the first time). When nothing is new, offers a full reprint.
export async function printKot({ token, storeId, order }) {
  const url = `/owner/${storeId}/restaurant-orders/${order.id}/kot`;
  let { kot } = await api(url, { token, method: 'POST', body: { mode: 'new' }, feedback: false });
  if (!kot.lines.length) {
    if (!window.confirm('Everything on this order was already sent to the kitchen. Reprint the full ticket?')) return;
    ({ kot } = await api(url, { token, method: 'POST', body: { mode: 'all' }, feedback: false }));
  }
  printHtml(kotHtml(kot));
}
export function KotButton({ token, storeId, order, disabled }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  return <><button type="button" className="btn btn-outline btn-small" disabled={busy || disabled} onClick={async () => { setBusy(true); setErr(''); try { await printKot({ token, storeId, order }); } catch (e) { setErr(e.message || 'Could not print'); } finally { setBusy(false); } }}><Printer size={14}/> Print KOT</button>{err && <small className="notice error" role="alert">{err}</small>}</>;
}
