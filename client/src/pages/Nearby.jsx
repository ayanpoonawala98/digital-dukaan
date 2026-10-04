import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, imageSrc } from '../lib/api.js';
import { loadLeaflet, TILE_URL, TILE_ATTR, geocode, currentPosition } from '../lib/leaflet.js';
import '../components/nearby.css';

const TYPES = [['', 'All'], ['retail', 'Shops'], ['restaurant', 'Restaurants'], ['services', 'Services']];
const dir = s => `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`;

function NearbyMap({ me, shops }) {
  const el = useRef(null);
  useEffect(() => {
    let map, dead = false;
    loadLeaflet().then(L => {
      if (dead || !el.current) return;
      map = L.map(el.current).setView([me.lat, me.lng], 13);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
      L.circleMarker([me.lat, me.lng], { radius: 8, color: '#2563eb', fillOpacity: 0.9 }).addTo(map).bindPopup('You are here');
      const pts = [[me.lat, me.lng]];
      shops.forEach(s => {
        const pop = document.createElement('div');
        const b = document.createElement('strong'); b.textContent = s.name; pop.appendChild(b);
        pop.appendChild(document.createElement('br')); pop.appendChild(document.createTextNode(`${s.distanceKm} km${s.area ? ' · ' + s.area : ''}`));
        pop.appendChild(document.createElement('br'));
        const a = document.createElement('a'); a.href = `/store/${s.slug}`; a.textContent = 'Visit shop'; pop.appendChild(a);
        L.marker([s.latitude, s.longitude]).addTo(map).bindPopup(pop); pts.push([s.latitude, s.longitude]);
      });
      if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      setTimeout(() => map.invalidateSize(), 200);
    }).catch(() => {});
    return () => { dead = true; if (map) map.remove(); };
  }, [me.lat, me.lng, shops]);
  return <div ref={el} className="nb-map" aria-label="Map of nearby shops"/>;
}

export default function Nearby() {
  const [me, setMe] = useState(null), [q, setQ] = useState(''), [type, setType] = useState(''), [openNow, setOpenNow] = useState(false), [radius, setRadius] = useState(25), [view, setView] = useState('list');
  const [shops, setShops] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');

  useEffect(() => {
    if (!me) return;
    let live = true; setBusy(true); setErr('');
    api('/public/nearby', { method: 'POST', body: { lat: me.lat, lng: me.lng, radiusKm: radius, type: type || undefined, openNow }, feedback: false })
      .then(r => { if (live) setShops(r.shops); }).catch(e => { if (live) setErr(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [me, type, openNow, radius]);

  const useMine = async () => { setErr(''); setBusy(true); try { const p = await currentPosition(); setMe({ ...p, label: 'your current location' }); } catch (e) { setErr(e.message); setBusy(false); } };
  const search = async e => { e?.preventDefault(); setErr(''); setBusy(true); try { const g = await geocode(q); setMe(g); } catch (er) { setErr(er.message); setBusy(false); } };

  return <main className="nb-wrap">
    <div className="nb-hero"><Link to="/" className="muted">digitalshop.</Link><h1>Shops near you</h1><p className="muted">Find local shops, restaurants and services close to you. We only use your location on this page while you search, and never save it.</p></div>
    <form className="nb-search" onSubmit={search}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="City, area or pincode" aria-label="City, area or pincode"/>
      <button className="btn btn-green" disabled={busy}>Search</button>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={useMine}>Use my location</button>
    </form>
    {err && <p className="nb-err" role="alert">{err}</p>}
    {me && <>
      <p className="muted">Showing shops within {radius} km of {me.label}.</p>
      <div className="nb-chips" role="group" aria-label="Category">{TYPES.map(([v, l]) => <button key={v || 'all'} type="button" className="nb-chip" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        <button type="button" className="nb-chip" aria-pressed={openNow} onClick={() => setOpenNow(!openNow)}>Open now</button></div>
      <div className="nb-ctrl"><label className="nb-within"><span>Within</span><select value={radius} onChange={e => setRadius(Number(e.target.value))}>{[2, 5, 10, 25, 50].map(r => <option key={r} value={r}>{r} km</option>)}</select></label>
        <div className="nb-seg" role="group" aria-label="View"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button></div></div>
      {busy && !shops && <p role="status">Finding shops...</p>}
      {shops && shops.length === 0 && <div className="nb-card" role="status"><div className="nb-body"><h3>No shops listed here yet</h3><p className="muted">No listed shops within {radius} km{type || openNow ? ' for these filters' : ''}. Try a bigger distance or another area.</p></div></div>}
      {shops && shops.length > 0 && (view === 'map' ? <NearbyMap me={me} shops={shops}/> : <div className="nb-grid">{shops.map(s => <article key={s.slug} className="nb-card">
        {s.logoUrl || s.coverUrl ? <img className="nb-logo" src={imageSrc(s.logoUrl || s.coverUrl)} alt="" loading="lazy"/> : <div className="nb-logo" aria-hidden="true"/>}
        <div className="nb-body"><h3>{s.name}</h3>
          <div className="nb-meta"><strong>{s.distanceKm} km</strong>{s.area && <span>{s.area}</span>}<span className={`nb-pill ${s.isOpen ? 'open' : 'closed'}`}>{s.isOpen ? 'Open now' : 'Closed'}</span>{s.isNew && <span className="nb-pill new">New near you</span>}{s.deliversToYou === true && <span className="nb-pill open">Delivers to you</span>}{s.deliversToYou === false && <span className="nb-pill">Outside delivery area</span>}</div>
          {s.description && <p className="muted" style={{ margin: 0 }}>{s.description}</p>}
          <div className="nb-actions"><Link className="btn btn-green btn-small" to={`/store/${s.slug}`}>Visit shop</Link><a className="btn btn-outline btn-small" href={dir(s)} target="_blank" rel="noopener noreferrer">Directions</a></div></div>
      </article>)}</div>)}
    </>}
    {!me && !err && <p className="muted">Allow your location or type where you are to see shops nearby.</p>}
  </main>;
}
