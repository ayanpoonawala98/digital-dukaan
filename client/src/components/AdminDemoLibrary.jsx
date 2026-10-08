import React, { useState } from 'react';
import demos from '../lib/admin-demos.json';
export default function AdminDemoLibrary() {
  const [selected, setSelected] = useState(demos[0]);
  return <section className="admin-demo-library" id="admin-demos" aria-labelledby="admin-demo-heading"><div className="container">
    <div className="section-intro"><span className="kicker">OWNER DASHBOARD / HINDI VOICE GUIDES</span><h2 id="admin-demo-heading">Learn every section.<br/><em>One step at a time.</em></h2><p>16 detailed guides, with Hindi narration and captions. Recorded using a demo shop. No real customer data, messages or payments.</p></div>
    <div className="admin-demo-layout"><nav className="admin-demo-nav" aria-label="Choose an admin tutorial">{demos.map(d => <button key={d.id} type="button" aria-pressed={selected.id === d.id} className={selected.id === d.id ? 'active' : ''} onClick={() => setSelected(d)}><span>{d.id.slice(0,2)}</span><strong>{d.title}</strong><small>{d.duration}</small></button>)}</nav>
      <div className="admin-demo-player"><video key={selected.id} controls playsInline preload="metadata" poster={`/admin-demos/${selected.id}.jpg`} aria-label={`${selected.title} detailed Hindi tutorial`} width="1280" height="900"><source src={`/admin-demos/${selected.id}.mp4`} type="video/mp4"/><track kind="captions" src={`/admin-demos/${selected.id}.vtt`} srcLang="hi" label="Hindi"/>Your browser does not support video.</video><div className="admin-demo-description"><span className="kicker">{selected.duration} / HINDI NARRATION</span><h3>{selected.title}</h3><p>{selected.description}</p><p className="admin-demo-note">Guided screen walkthrough. Provider setup and live sends are explained, not performed. Customer management is not enabled in this deployment.</p><details><summary>Read the full tutorial</summary><div className="admin-demo-transcript">{selected.transcript.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}</div></details><a className="text-link" href={`/admin-demos/${selected.id}.mp4`} download>Download this tutorial</a></div></div>
    </div>
  </div></section>;
}
