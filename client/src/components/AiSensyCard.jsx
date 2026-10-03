import React, {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {useFeedbackState} from './Toasts.jsx';
// Owner-only. Each shop connects its own AiSensy account (own number, own billing) by pasting its API campaign key.
// Hidden for shops the server has not enabled yet.
const KINDS=[
  ['confirm','Order confirmation to the customer','Hi! Your order {{2}} at {{1}} is received. Total: {{3}}. We will update you as it moves.','1 shop name, 2 order number, 3 total'],
  ['alert','New order alert to you','New order {{1}}: {{2}}. Total: {{3}}. Open your dashboard to review it.','1 order number, 2 items, 3 total'],
  ['status','Order status update to the customer','Update on your order {{1}}: it is {{2}}.','1 order number, 2 status']
];
export default function AiSensyCard({token,storeId}) {
  const root=`/owner/${storeId}/aisensy`;
  const [state,setState]=useState(null),[key,setKey]=useState(''),[camps,setCamps]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState(''),[phone,setPhone]=useState(''),[guide,setGuide]=useState(false);
  useEffect(()=>{let live=true;setState(null);api(root,{token,feedback:false}).then(r=>{if(live){setState(r);setCamps(r.campaigns||{});setPhone(r.ownerPhone||'');}}).catch(()=>{});return ()=>{live=false;};},[root,token]);
  if(!state)return null;
  async function save(extra={}){
    if(busy)return;setBusy(true);setError('');
    try{const r=await api(root,{token,method:'PUT',body:{campaigns:camps,...(key.trim()?{apiKey:key.trim()}:{}),...extra},successMessage:'AiSensy settings saved'});setState(r);setCamps(r.campaigns||{});setKey('');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function test(kind){
    if(busy)return;setBusy(true);setError('');
    try{await api(`${root}/test`,{token,method:'POST',body:{kind,phone},successMessage:'Test sent. Check the phone.'});setState(await api(root,{token,feedback:false}));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function remove(){
    if(busy||!window.confirm('Disconnect AiSensy and delete the saved key?'))return;setBusy(true);setError('');
    try{setState(await api(root,{token,method:'DELETE',successMessage:'AiSensy disconnected'}));setCamps({});setKey('');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="dashboard-panel"><h3>Send order messages with your own AiSensy</h3>
    <p className="muted">Use your own WhatsApp number through AiSensy. You create the account, pay AiSensy directly, and we only send your order messages through your key. Your key is stored encrypted and is never shown again.</p>
    <button className="btn btn-outline btn-small" onClick={()=>setGuide(!guide)}>{guide?'Hide setup guide':'Show setup guide'}</button>
    {guide&&<ol className="muted" style={{lineHeight:1.6}}>
      <li>Sign up at aisensy.com and connect your WhatsApp Business number (Continue with Facebook). Wait for Meta to approve it.</li>
      <li>In AiSensy go to Templates and create the three templates below. Wait until each shows Approved.</li>
      <li>For each template go to Campaigns, Launch, API Campaign. Pick the template, give it a name, and set it Live.</li>
      <li>Go to Developer, API Campaign Key, generate the key and copy it. It is shown only once.</li>
      <li>Paste the key and the three campaign names here. Send a test to your own phone, then turn it on.</li>
      {KINDS.map(([k,label,text,vars])=><li key={k} style={{listStyle:'none'}}><strong>{label}</strong><br/><code style={{whiteSpace:'pre-wrap'}}>{text}</code><br/>Variables: {vars}</li>)}
    </ol>}
    <label>AiSensy API campaign key {state.connected&&<span className="muted">(saved, ends in {state.keyHint}; leave empty to keep)</span>}<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={state.connected?'Paste a new key to replace':'Paste your key'}/></label>
    {KINDS.map(([k,label])=><label key={k}>{label}: campaign name<input value={camps[k]||''} maxLength={100} onChange={e=>setCamps({...camps,[k]:e.target.value})} placeholder="Name of the live API campaign in AiSensy"/></label>)}
    <label>Send test to this number<input inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Your mobile number"/></label>
    {error&&<p className="error">{error}</p>}
    {state.lastStatus&&<p className="muted">Last send: {state.lastStatus==='ok'?'worked':`failed (${state.lastError||'unknown'})`}</p>}
    <div className="inline-form" style={{flexWrap:'wrap'}}>
      <button className="btn btn-outline btn-small" disabled={busy||(!state.connected&&!key.trim())} onClick={()=>save()}>Save</button>
      {state.connected&&KINDS.map(([k])=><button key={k} className="btn btn-outline btn-small" disabled={busy||!camps[k]||state.campaigns[k]!==camps[k]} onClick={()=>test(k)}>Test {k}</button>)}
      {state.connected&&(state.enabled
        ?<button className="btn btn-outline btn-small" disabled={busy} onClick={()=>save({enabled:false})}>Turn off</button>
        :<button className="btn btn-green" disabled={busy} onClick={()=>save({enabled:true})}>Turn on</button>)}
      {state.connected&&<button className="btn btn-outline btn-small" disabled={busy} onClick={remove}>Disconnect</button>}
      <span className="muted">{state.enabled?'Status: ON':'Status: OFF'}</span>
    </div>
    <p className="muted">While this is ON, order messages for this shop go through your AiSensy account instead of the shared number.</p>
  </section>;
}
