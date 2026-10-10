import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useEffect, useRef, useState } from 'react';
import { loadLeaflet, TILE_URL, TILE_ATTR, geocode, currentPosition } from '../../shared/lib/leaflet.js';
import '../storefront/nearby.css';

const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const latErr = v => v === '' || v === null || v === undefined ? '' : (!Number.isFinite(Number(v)) || Number(v) < -90 || Number(v) > 90 ? 'Latitude must be between -90 and 90' : '');
const lngErr = v => v === '' || v === null || v === undefined ? '' : (!Number.isFinite(Number(v)) || Number(v) < -180 || Number(v) > 180 ? 'Longitude must be between -180 and 180' : '');

export default function LocationPicker({ form, set }) {
  const el = useRef(null), map = useRef(null), marker = useRef(null), L = useRef(null);
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [mapErr, setMapErr] = useState('');
  const lat = num(form.latitude), lng = num(form.longitude);
  const valid = lat !== null && lng !== null && !latErr(form.latitude) && !lngErr(form.longitude);
  const setPoint = (la, ln) => { set('latitude', Number(la.toFixed(6))); set('longitude', Number(ln.toFixed(6))); };

  useEffect(() => {
    let dead = false;
    loadLeaflet().then(Lf => {
      if (dead || !el.current || map.current) return;
      L.current = Lf;
      const m = Lf.map(el.current, { scrollWheelZoom: false }).setView(valid ? [lat, lng] : [20.59, 78.96], valid ? 15 : 5);
      Lf.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(m);
      m.on('click', e => setPoint(e.latlng.lat, e.latlng.lng));
      map.current = m;
      if (valid) putMarker(lat, lng);
      setTimeout(() => m.invalidateSize(), 200);
    }).catch(e => setMapErr(e.message));
    return () => { dead = true; if (map.current) { map.current.remove(); map.current = null; marker.current = null; } };
  }, []);

  function putMarker(la, ln) {
    if (!map.current || !L.current) return;
    if (!marker.current) {
      marker.current = L.current.marker([la, ln], { draggable: true }).addTo(map.current);
      marker.current.on('dragend', () => { const p = marker.current.getLatLng(); setPoint(p.lat, p.lng); });
    } else marker.current.setLatLng([la, ln]);
  }
  useEffect(() => {
    if (!map.current) return;
    if (valid) { putMarker(lat, lng); map.current.setView([lat, lng], Math.max(map.current.getZoom(), 15)); }
    else if (marker.current) { marker.current.remove(); marker.current = null; }
  }, [valid, lat, lng]);

  const useMine = async () => {
    setBusy(true); setMsg('');
    try { const p = await currentPosition(); setPoint(p.lat, p.lng); setMsg(ot("Pin moved to your current location. Drag it to fine-tune, then save.")); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const search = async () => {
    setBusy(true); setMsg('');
    try { const q = [form.area, form.pincode, form.location].filter(Boolean).join(' '); const g = await geocode(q); setPoint(g.lat, g.lng); setMsg(ot("Pin moved to {v0}. Drag it to your exact shop.", {v0: g.label})); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  return <div className="lp">
    <h4>{ot("Shop location (nearby directory)")}</h4>
    <p className="muted">{ot("Tap the map or drag the pin to your shop. Free OpenStreetMap, no Google key needed.")}</p>
    <div className="lp-actions">
      <button type="button" className="btn btn-outline" disabled={busy} onClick={useMine}>{ot("Use my current location")}</button>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={search}>{ot("Find from area / pincode")}</button>
    </div>
    {msg && <p role="status" className="muted">{msg}</p>}
    {mapErr ? <p className="nb-err">{mapErr} {ot("You can still type the coordinates below.")}</p> : <div ref={el} className="lp-map" aria-label={ot("Shop location map")}/>}
    <div className="lp-grid">
      <label>{ot("Latitude")}<input inputMode="decimal" value={form.latitude ?? ''} onChange={e => set('latitude', e.target.value)} placeholder="19.0760" aria-invalid={Boolean(latErr(form.latitude))}/>{latErr(form.latitude) && <small className="nb-err">{latErr(form.latitude)}</small>}</label>
      <label>{ot("Longitude")}<input inputMode="decimal" value={form.longitude ?? ''} onChange={e => set('longitude', e.target.value)} placeholder="72.8777" aria-invalid={Boolean(lngErr(form.longitude))}/>{lngErr(form.longitude) && <small className="nb-err">{lngErr(form.longitude)}</small>}</label>
      <label className="lp-wide">{ot("Area / locality")}<input value={form.area || ''} maxLength={80} onChange={e => set('area', e.target.value)} placeholder={ot("Mumbra, Thane")}/></label>
      <label>{ot("Pincode")}<input inputMode="numeric" value={form.pincode || ''} maxLength={10} onChange={e => set('pincode', e.target.value)} placeholder="400612"/></label>
      <label className="lp-wide">{ot("Delivery radius in km (optional)")}<input inputMode="decimal" value={form.serviceRadiusKm ?? ''} onChange={e => set('serviceRadiusKm', e.target.value)} placeholder="5"/></label>
    </div>
    <label className="lp-toggle"><input type="checkbox" checked={Boolean(form.listInDirectory)} onChange={e => set('listInDirectory', e.target.checked)}/><span><strong>{ot("List my shop in the nearby directory")}</strong><small>{ot("digitalshop.website/near. Off by default and needs a saved location. Customers see your shop name, area, distance and whether you are open.")}</small></span></label>
  </div>;
}
