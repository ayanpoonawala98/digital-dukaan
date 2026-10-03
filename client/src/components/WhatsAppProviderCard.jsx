import React, {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {useFeedbackState} from './Toasts.jsx';
import AutoReplyCard from './AutoReplyCard.jsx';
import WhatsAppInbox from './WhatsAppInbox.jsx';

const LABELS={accessToken:'System user access token',phoneNumberId:'Phone number ID',appSecret:'App secret (optional, lets us verify Meta signatures)',apiKey:'360dialog API key',accountSid:'Account SID',authToken:'Auth token',from:'Your Twilio WhatsApp number (+91...)'};
const SECRET=new Set(['accessToken','appSecret','apiKey','authToken']);
const NAMES={meta:'Meta Cloud API (your own Meta app)','360dialog':'360dialog',twilio:'Twilio'};
const STEPS={
  meta:['In Meta for Developers, create a Business app and add the WhatsApp product.','Add your own phone number to your WhatsApp Business Account and copy its Phone number ID.','In Business Settings, create a System user, give it your WhatsApp account, and generate a token with whatsapp_business_messaging and whatsapp_business_management.','Paste the token and Phone number ID below, then press Save and test.','In your app WhatsApp > Configuration, set the Callback URL and Verify token shown below, and subscribe to "messages".','Create the 3 templates below in WhatsApp Manager and enter their names.'],
  '360dialog':['Get your number live on 360dialog and copy its API key from the 360dialog Hub.','Paste the API key below, then press Save and test.','In the 360dialog Hub, set the webhook URL shown below.','Create the 3 templates below in the Hub and enter their names.'],
  twilio:['In Twilio, enable WhatsApp on your number (or a WhatsApp sender) and copy your Account SID and Auth Token.','Paste them below with your WhatsApp number, then press Save and test.','In Twilio, set "When a message comes in" and the status callback to the webhook URL shown below (HTTP POST).','Create the 3 templates in Twilio Content Template Builder, get them approved, and enter each Content SID (starts with HX) as the template name.']
};
const copy=t=>navigator.clipboard?.writeText(t).catch(()=>{});
export default function WhatsAppProviderCard({token,storeId,staff}) {
  const root=`/owner/${storeId}/whatsapp-byo`;
  const [st,setSt]=useState(null),[off,setOff]=useState(false),[provider,setProvider]=useState('360dialog'),[cred,setCred]=useState({}),[tpl,setTpl]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('');
  const apply=r=>{setSt(r);if(r.connected){setProvider(r.provider);setTpl(r.templates||{});}};
  useEffect(()=>{let live=true;setSt(null);setOff(false);api(`${root}/status`,{token,feedback:false}).then(r=>{if(live)apply(r);}).catch(()=>{if(live)setOff(true);});return ()=>{live=false;};},[root,token]);
  if(staff)return null;
  const providers=[{id:'meta'},{id:'360dialog'},{id:'twilio'}];
  if(off)return <section style={{border:'1px solid var(--line)',padding:18,marginBottom:20}}><h4>Connect your own WhatsApp number</h4><p>Every shop uses its own WhatsApp number through the provider it already has: Meta Cloud API, 360dialog or Twilio.</p><p style={{display:'flex',gap:8,flexWrap:'wrap'}}>{providers.map(p=><button key={p.id} className="btn" disabled>{NAMES[p.id]} - Coming soon</button>)}</p><p>This will be available for your shop soon.</p></section>;
  if(!st)return <p role="status">Loading...</p>;
  const fields=(st.providers||[]).find(p=>p.id===provider)?.fields||[],req=new Set((st.providers||[]).find(p=>p.id===provider)?.required||[]);
  const same=st.connected&&st.provider===provider;
  async function run(fn,ok){if(busy)return;setBusy(true);setError('');try{apply(await fn());if(ok)setError('');}catch(e){setError(e.message);}finally{setBusy(false);}}
  const save=()=>run(()=>api(`${root}/connection`,{token,method:'PUT',body:{provider,credentials:cred,templates:tpl},successMessage:'Saved and checked with your provider'}).then(r=>{setCred({});return r;}));
  const toggle=on=>run(()=>api(`${root}/toggle`,{token,method:'POST',body:{enabled:on},successMessage:on?'WhatsApp is ON for your shop':'WhatsApp is OFF'}));
  const disconnect=()=>{if(window.confirm('Disconnect your WhatsApp provider from this shop? Your saved keys will be deleted.'))run(()=>api(`${root}/connection`,{token,method:'DELETE',successMessage:'Disconnected'}).then(r=>{setCred({});setTpl({});return r;}));};
  const box={border:'1px solid var(--line)',padding:18,marginBottom:20};
  return <><section style={box}><h4>Connect your own WhatsApp number</h4>
    <p>Each shop uses its own number. Pick how your number is provided, add its details, and switch it on. Customers see your shop's number, and your provider bills you directly.</p>
    <div role="radiogroup" aria-label="Provider" style={{display:'flex',gap:16,flexWrap:'wrap',margin:'12px 0'}}>{providers.map(p=><label key={p.id}><input type="radio" name="wa-provider" checked={provider===p.id} onChange={()=>{setProvider(p.id);setCred({});}}/> {NAMES[p.id]}</label>)}</div>
    {fields.map(f=><label key={f} style={{display:'block',marginBottom:10}}>{LABELS[f]}{req.has(f)?'':' '}<input type={SECRET.has(f)?'password':'text'} autoComplete="off" value={cred[f]||''} placeholder={same&&SECRET.has(f)?'Saved. Leave blank to keep':''} onChange={e=>setCred({...cred,[f]:e.target.value})}/></label>)}
    <h5>Template names (approved in your provider)</h5>
    {[['orderConfirm','Order confirmation'],['orderAlert','New order alert (to you)'],['orderStatus','Order status update']].map(([k,l])=><label key={k} style={{display:'block',marginBottom:10}}>{l}<input type="text" value={tpl[k]?.name||''} placeholder={provider==='twilio'?'Content SID, e.g. HXxxxxxxxx':'template name'} onChange={e=>setTpl({...tpl,[k]:{name:e.target.value,lang:tpl[k]?.lang||'en'}})}/></label>)}
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="inline-form"><button className="btn btn-green" disabled={busy} onClick={save}>{busy?'Checking...':'Save and test'}</button>
      {st.connected&&(st.enabled?<button className="btn btn-outline btn-small" disabled={busy} onClick={()=>toggle(false)}>Turn OFF</button>:<button className="btn btn-outline btn-small" disabled={busy} onClick={()=>toggle(true)}>Turn ON</button>)}
      {st.connected&&<button className="btn btn-outline btn-small" disabled={busy} onClick={disconnect}>Disconnect</button>}
      <span className="muted">{st.connected?`${NAMES[st.provider]}${st.sender?' · '+st.sender:''} · ${st.enabled?'ON':'OFF'}`:'Not connected'}</span></div>
    {st.connected&&st.webhookUrl&&<div style={{marginTop:16}}><h5>Webhook URL (paste into {NAMES[st.provider]})</h5><p style={{overflowWrap:'anywhere'}}><code>{st.webhookUrl}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(st.webhookUrl)}>Copy</button></p>{st.verifyToken&&<p>Verify token: <code>{st.verifyToken}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(st.verifyToken)}>Copy</button></p>}</div>}
    <details style={{marginTop:16}}><summary>Setup guide for {NAMES[provider]}</summary><ol>{STEPS[provider].map((s,i)=><li key={i}>{s}</li>)}</ol>
      <p>Create these 3 templates (category Utility, language English). Variables {'{{1}}'}, {'{{2}}'} are filled in order:</p>
      {(st.guide||[]).map(g=><div key={g.key} style={{marginBottom:10}}><strong>{g.event}</strong><br/><code style={{overflowWrap:'anywhere'}}>{g.body}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(g.body)}>Copy</button><br/><span className="muted">Variables: {g.params}</span></div>)}
      <p className="muted">Inside 24 hours of a customer message we send normal text. Outside it, WhatsApp only allows approved templates, so alerts to you need the templates above.</p></details>
  </section>
  {st.connected&&<WhatsAppInbox token={token} root={root} canSend={Boolean(st.enabled)}/>}
  {st.connected&&<div style={{marginTop:28,paddingTop:24,borderTop:'1px solid var(--line)'}}><AutoReplyCard token={token} storeId={storeId} base="whatsapp-byo"/></div>}</>;
}
