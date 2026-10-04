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
  '360dialog':[
    'Sign up: go to 360dialog.com, create an account, and open the 360dialog Hub (hub.360dialog.com).',
    'Add a WhatsApp number in the Hub (Channels > New channel). Use a number that is not already on the WhatsApp app, or delete it from WhatsApp first. Finish the Meta business verification steps the Hub shows and wait until the channel says "Running".',
    'Open your channel in the Hub, go to the API key section, and generate/copy the API key (the long key for that channel, not your login password).',
    'Paste the API key below. Leave the template names empty for now. Press Save and test. If it says connected, the key works.',
    'In the Hub, open your channel settings and set the webhook URL to URL 1 shown in "Your shop\'s own URLs" (appears right after you save). Keep the URL private, it contains a secret. 360dialog does not use a separate status URL: delivery status comes to the same webhook.',
    'Create the 3 message templates (see the list below) in the Hub under Templates: category Utility, language English, body exactly as shown. Approval usually takes a few minutes to a few hours.',
    'When approved, type each template name in the 3 template boxes below and Save again.',
    'Test: from your own phone send "hi" to the shop number, then check the Inbox below and reply from it. Then place a demo order from your store using your own number and change its status in Orders; you should get the WhatsApp message.',
    'Common errors: "Invalid API key" = copied the wrong key or the channel is not Running yet. No messages arriving = webhook URL not saved in the Hub or pasted with spaces. Template rejected = category must be Utility and variables must be in order {{1}}, {{2}}. Message not delivered outside 24 hours = the customer has not messaged you in the last 24h and the template is not approved yet.'
  ],
  twilio:[
    'Sign up: create a Twilio account at twilio.com/try-twilio and verify your email and phone. Twilio asks you to complete a captcha, do that yourself.',
    'Get your credentials: in the Twilio Console home page, copy the Account SID (starts with AC) and the Auth Token (tap the eye icon to reveal it). These are the two secrets you paste below.',
    'Testing for free: Console > Messaging > Try it out > Send a WhatsApp message. Twilio shows the sandbox number (+1 415 523 8886) and a join phrase. From your phone, send "join <your phrase>" to that number once. The sandbox only talks to phones that joined, and the join lasts 24 hours.',
    'Going live with your own number: Console > Messaging > Senders > WhatsApp senders > New sender. Register your number (not already on the WhatsApp app) and connect your Facebook Business Manager. Twilio bills you directly.',
    'Paste below: Account SID, Auth token, and your WhatsApp number in international format with +, for example +14155238886 for the sandbox or +91XXXXXXXXXX for your own. Press Save and test.',
    'After saving, "Your shop\'s own URLs" appears. In Twilio (sandbox: Sandbox settings; live sender: the sender\'s Endpoint configuration) paste URL 1 into "When a message comes in" and URL 2 into "Status callback URL", both with method HTTP POST. Never swap them: messages sent to the status URL are ignored. Keep both URLs private.',
    'Templates (needed only outside the 24-hour window; the sandbox does not need them): Console > Messaging > Content Template Builder > Create new. Type: WhatsApp, category Utility, language English, body exactly as shown below. Submit for WhatsApp approval. When approved, copy each Content SID (starts with HX) and paste it as the template name.',
    'Turn the connection ON with the button below only when you are ready: from then on real order messages go out through your number.',
    'Test: from your phone (joined to the sandbox) send "hi" to the number, check the Inbox below, reply from it, then place a demo order using your own number and change its status in Orders. You should get the WhatsApp message.',
    'Common errors: 63007 / "Channel not found" = the number in the From box does not match your sender (include +). 63016 or 63015 = the customer has not messaged in the last 24 hours (or has not joined the sandbox) and no approved template is set. 401 / "authenticate" = wrong Account SID or Auth token. Replies not showing in Inbox = URL 1 not saved in Twilio, wrong method (must be POST), or the two URLs swapped. No delivery ticks in the dashboard = URL 2 missing from "Status callback URL".'
  ]
};
const copy=t=>navigator.clipboard?.writeText(t).catch(()=>{});
const IBTN={width:22,height:22,borderRadius:'50%',border:'1px solid currentColor',background:'none',cursor:'pointer',fontStyle:'italic',fontWeight:700,lineHeight:'18px',padding:0,color:'inherit'};
export default function WhatsAppProviderCard({token,storeId,staff}) {
  const root=`/owner/${storeId}/whatsapp-byo`;
  const [st,setSt]=useState(null),[off,setOff]=useState(false),[provider,setProvider]=useState('360dialog'),[cred,setCred]=useState({}),[tpl,setTpl]=useState({}),[busy,setBusy]=useState(false),[info,setInfo]=useState(null),[error,setError]=useFeedbackState('');
  const apply=r=>{setSt(r);if(r.connected){setProvider(r.provider);setTpl(r.templates||{});}};
  useEffect(()=>{let live=true;setSt(null);setOff(false);api(`${root}/status`,{token,feedback:false}).then(r=>{if(live)apply(r);}).catch(()=>{if(live)setOff(true);});return ()=>{live=false;};},[root,token]);
  if(staff)return null;
  const providers=[{id:'meta'},{id:'360dialog'},{id:'twilio'}];
  if(off)return <section style={{border:'1px solid var(--line)',padding:18,marginBottom:20}}><h4>Connect your own WhatsApp number</h4><p>Every shop uses its own WhatsApp number through the provider it already has: Meta Cloud API, 360dialog or Twilio.</p><p style={{display:'flex',gap:8,flexWrap:'wrap'}}>{providers.map(p=><button key={p.id} className="btn" disabled>{NAMES[p.id]} - Coming soon</button>)}</p><p>This will be available for your shop soon.</p></section>;
  if(!st)return <p role="status">Loading...</p>;
  const fields=(st.providers||[]).find(p=>p.id===provider)?.fields||[],req=new Set((st.providers||[]).find(p=>p.id===provider)?.required||[]);
  const showInfo=info===null?!st.connected:info;
  const same=st.connected&&st.provider===provider;
  async function run(fn,ok){if(busy)return;setBusy(true);setError('');try{apply(await fn());if(ok)setError('');}catch(e){setError(e.message);}finally{setBusy(false);}}
  const save=()=>run(()=>api(`${root}/connection`,{token,method:'PUT',body:{provider,credentials:cred,templates:tpl},successMessage:'Saved and checked with your provider'}).then(r=>{setCred({});return r;}));
  const toggle=on=>run(()=>api(`${root}/toggle`,{token,method:'POST',body:{enabled:on},successMessage:on?'WhatsApp is ON for your shop':'WhatsApp is OFF'}));
  const disconnect=()=>{if(window.confirm('Disconnect your WhatsApp provider from this shop? Your saved keys will be deleted.'))run(()=>api(`${root}/connection`,{token,method:'DELETE',successMessage:'Disconnected'}).then(r=>{setCred({});setTpl({});return r;}));};
  const box={border:'1px solid var(--line)',padding:18,marginBottom:20};
  return <><section style={box}><h4>Connect your own WhatsApp number</h4>
    <p>Each shop uses its own number. Pick how your number is provided, add its details, and switch it on. Customers see your shop's number, and your provider bills you directly.</p>
    <div role="radiogroup" aria-label="Provider" style={{display:'flex',gap:16,flexWrap:'wrap',margin:'12px 0'}}>{providers.map(p=><label key={p.id} style={{display:'inline-flex',alignItems:'center',gap:6}}><input type="radio" name="wa-provider" checked={provider===p.id} onChange={()=>{setProvider(p.id);setCred({});}}/> {NAMES[p.id]} <button type="button" aria-label={`How to connect ${NAMES[p.id]}`} title={`How to connect ${NAMES[p.id]}`} onClick={e=>{e.preventDefault();if(provider===p.id){setInfo(!showInfo);}else{setProvider(p.id);setCred({});setInfo(true);}}} style={IBTN}>i</button></label>)}</div>
    {fields.map(f=><label key={f} style={{display:'block',marginBottom:10}}>{LABELS[f]}{req.has(f)?'':' '}<input type={SECRET.has(f)?'password':'text'} autoComplete="off" value={cred[f]||''} placeholder={same&&SECRET.has(f)?'Saved. Leave blank to keep':''} onChange={e=>setCred({...cred,[f]:e.target.value})}/></label>)}
    <h5>Template names (approved in your provider)</h5>
    {[['orderConfirm','Order confirmation'],['orderAlert','New order alert (to you)'],['orderStatus','Order status update']].map(([k,l])=><label key={k} style={{display:'block',marginBottom:10}}>{l}<input type="text" value={tpl[k]?.name||''} placeholder={provider==='twilio'?'Content SID, e.g. HXxxxxxxxx':'template name'} onChange={e=>setTpl({...tpl,[k]:{name:e.target.value,lang:tpl[k]?.lang||'en'}})}/></label>)}
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="inline-form"><button className="btn btn-green" disabled={busy} onClick={save}>{busy?'Checking...':'Save and test'}</button>
      {st.connected&&(st.enabled?<button className="btn btn-outline btn-small" disabled={busy} onClick={()=>toggle(false)}>Turn OFF</button>:<button className="btn btn-outline btn-small" disabled={busy} onClick={()=>toggle(true)}>Turn ON</button>)}
      {st.connected&&<button className="btn btn-outline btn-small" disabled={busy} onClick={disconnect}>Disconnect</button>}
      <span className="muted">{st.connected?`${NAMES[st.provider]}${st.sender?' · '+st.sender:''} · ${st.enabled?'ON':'OFF'}`:'Not connected'}</span></div>
    {st.connected&&<p className="muted" style={{marginTop:12}} role="status">Last send: {!st.lastSend?'none yet':st.lastSend.status==='skipped'?`NOT sent (${({no_window_no_template:'the customer has not messaged this number in the last 24 hours and no approved template is set',bad_phone:'customer number is not valid'})[st.lastSend.reason]||st.lastSend.reason}) to ${st.lastSend.to}`:st.lastSend.status==='failed'||st.lastSend.status==='unknown'?`failed${st.lastSend.reason?' (provider error '+st.lastSend.reason+')':''} to ${st.lastSend.to}`:`${st.lastSend.status} to ${st.lastSend.to}`} · {st.lastSend?new Date(st.lastSend.at).toLocaleString('en-IN'):''}</p>}
    {!st.connected&&provider!=='meta'&&<p className="muted" style={{marginTop:12}}>Your shop's own webhook URLs for {NAMES[provider]} appear here right after you press Save and test. Tap the (i) next to {NAMES[provider]} for step-by-step setup.</p>}
    {st.connected&&st.webhookUrl&&<div style={{marginTop:16}}><h5 style={{display:'flex',alignItems:'center',gap:8}}>Your shop's own URLs for {NAMES[st.provider]} <button type="button" aria-label="How to connect" title="How to connect" aria-expanded={showInfo} onClick={()=>setInfo(!showInfo)} style={IBTN}>i</button></h5><div style={{marginBottom:12}}><strong>1. Inbound messages</strong><br/><span className="muted">Paste into: {st.provider==='twilio'?'"When a message comes in"':'the incoming messages / webhook field'}</span><p style={{overflowWrap:'anywhere',margin:'4px 0'}}><code>{st.webhookUrl}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(st.webhookUrl)}>Copy</button></p></div>{st.statusUrl&&<div style={{marginBottom:12}}><strong>2. Delivery status</strong><br/><span className="muted">Paste into: "Status callback URL". Do not swap the two: inbound messages sent to the status URL are ignored.</span><p style={{overflowWrap:'anywhere',margin:'4px 0'}}><code>{st.statusUrl}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(st.statusUrl)}>Copy</button></p></div>}{st.verifyToken&&<p>Verify token: <code>{st.verifyToken}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(st.verifyToken)}>Copy</button></p>}</div>}
    {showInfo&&<div role="note" style={{marginTop:16,border:'1px solid var(--line)',padding:14,borderRadius:8}}><strong>How to connect {NAMES[provider]}</strong><ol>{STEPS[provider].map((s,i)=><li key={i}>{s}</li>)}</ol>
      <p>Create these 3 templates (category Utility, language English). Variables {'{{1}}'}, {'{{2}}'} are filled in order:</p>
      {(st.guide||[]).map(g=><div key={g.key} style={{marginBottom:10}}><strong>{g.event}</strong><br/><code style={{overflowWrap:'anywhere'}}>{g.body}</code> <button className="btn btn-outline btn-small" onClick={()=>copy(g.body)}>Copy</button><br/><span className="muted">Variables: {g.params}</span></div>)}
      <p className="muted">Inside 24 hours of a customer message we send normal text. Outside it, WhatsApp only allows approved templates, so alerts to you need the templates above.</p></div>}
  </section>
  {st.connected&&<WhatsAppInbox token={token} root={root} canSend={Boolean(st.enabled)}/>}
  {st.connected&&<div style={{marginTop:28,paddingTop:24,borderTop:'1px solid var(--line)'}}><AutoReplyCard token={token} storeId={storeId} base="whatsapp-byo"/></div>}</>;
}
