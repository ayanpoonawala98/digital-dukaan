import React, {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import Busy from './Busy.jsx';
// Superadmin only: email / SMS alerts when someone asks to open a new store. Any provider, keys stay encrypted server-side.
const GROUPS={email:{resend:'resend',smtp:'smtp',http:'emailHttp'},sms:{fast2sms:'fast2sms',http:'smsHttp'}};
const initForm=k=>({emailMode:k.emailMode,smsMode:k.smsMode,resend:{from:k.resend.from},smtp:{host:k.smtp.host,port:k.smtp.port||587,secure:k.smtp.secure,user:k.smtp.user,from:k.smtp.from},emailHttp:{url:k.emailHttp.url,method:k.emailHttp.method||'POST',contentType:k.emailHttp.contentType||'json',headers:k.emailHttp.headers,body:k.emailHttp.body},fast2sms:{route:k.fast2sms.route||'quick',senderId:k.fast2sms.senderId,templateId:k.fast2sms.templateId},smsHttp:{url:k.smsHttp.url,method:k.smsHttp.method||'POST',contentType:k.smsHttp.contentType||'json',headers:k.smsHttp.headers,body:k.smsHttp.body}});
export default function PlatformAlerts({token}) {
  const [state,setState]=useState(null),[set,setSet]=useState(null),[keys,setKeys]=useState(null),[kf,setKf]=useState({}),[busy,setBusy]=useState(''),[msg,setMsg]=useState(null);
  const apply=d=>{setState(d.providers);setSet(d.settings);setKeys(d.keys);setKf(initForm(d.keys));};
  useEffect(()=>{api('/admin/alerts',{token,feedback:false}).then(apply).catch(()=>setState(false));},[token]);
  if(state===false)return null;
  if(!set)return <div className="dashboard-panel"><h3>Platform email & request alerts</h3><p className="muted">Loading...</p></div>;
  const run=async(key,fn)=>{if(busy)return;setBusy(key);setMsg(null);try{await fn();}catch(e){setMsg({error:e.message});}finally{setBusy('');}};
  const setK=(g,f,v)=>setKf(x=>({...x,[g]:{...x[g],[f]:v}}));
  const secretIn=(g,f,label,saved,hint)=><label>{label}<input type="password" autoComplete="new-password" value={kf[`${g}_s`]?.[f]||''} onChange={e=>setKf(x=>({...x,[`${g}_s`]:{...x[`${g}_s`],[f]:e.target.value}}))} placeholder={saved?`${hint||'••••••••'} saved. Type to replace`:'Paste it here'}/></label>;
  const textIn=(g,f,label,ph)=><label>{label}<input value={kf[g]?.[f]??''} onChange={e=>setK(g,f,e.target.value)} placeholder={ph}/></label>;
  const httpFields=(g,v,sms)=><>
    <div className="notify-two">{textIn(g,'url','API URL (https)',sms?'https://api.yourgateway.com/send':'https://api.yourmail.com/v1/send')}<label>Method<select value={kf[g]?.method||'POST'} onChange={e=>setK(g,'method',e.target.value)}><option>POST</option><option>GET</option></select></label></div>
    <div className="notify-two"><label>Body format<select value={kf[g]?.contentType||'json'} onChange={e=>setK(g,'contentType',e.target.value)}><option value="json">JSON</option><option value="form">Form (key=value)</option><option value="text">Plain text</option></select></label>{secretIn(g,'key','API key or token',v.keySaved,v.keyHint)}</div>
    <label>Headers <small>(one per line, e.g. Authorization: Bearer {'{{key}}'})</small><textarea rows={2} value={kf[g]?.headers||''} onChange={e=>setK(g,'headers',e.target.value)}/></label>
    <label>Body template <small>(for POST)</small><textarea rows={3} value={kf[g]?.body||''} onChange={e=>setK(g,'body',e.target.value)} placeholder={sms?'{"to":"{{to_intl}}","message":"{{message}}"}':'{"to":"{{to}}","subject":"{{subject}}","text":"{{message}}"}'}/></label>
    <p className="muted">Placeholders: {sms?'{{to}}, {{to_intl}}, ':'{{to}}, {{subject}}, '}{'{{message}}, {{store}}, {{key}}, {{key_b64}}. Put secrets only in the key field and use {{key}}.'}</p></>;
  const saveProvider=ch=>run(`k-${ch}`,async()=>{
    const mode=kf[`${ch}Mode`];let body;
    if(!mode)body={clear:[ch]};else{const g=GROUPS[ch][mode];body={[`${ch}Mode`]:mode,[g]:{...kf[g],...(kf[`${g}_s`]||{})}};if(g==='smtp')body.smtp.port=Number(body.smtp.port);}
    const d=await api('/admin/alerts/keys',{token,method:'PUT',body,successMessage:'Provider saved'});apply(d);
  });
  const saveSettings=()=>run('settings',async()=>{apply(await api('/admin/alerts',{token,method:'PUT',body:set,successMessage:'Alert settings saved'}));});
  const test=ch=>run(`t-${ch}`,async()=>{await api('/admin/alerts/test',{token,method:'POST',body:{channel:ch},feedback:false});setMsg({ok:`Test ${ch==='email'?'email':'SMS'} sent`});});
  const badge=p=><span className={`status-pill ${p.configured?'on':'off'}`}>{p.configured?`Ready: ${p.label}`:'Not connected'}</span>;
  return <div className="dashboard-panel settings-panel notify-settings">
    <h3>Platform email & request alerts</h3>
    <p className="muted">When someone asks to open a new shop, send you an email and/or SMS. Nothing is sent until you connect a provider and switch it on. Keys are encrypted and never shown again. SMS and email costs are charged by your provider.</p>
    <div className="notify-row"><strong>Email</strong>{badge(state.email)}</div>
    <details className="notify-provider"><summary>{state.email.configured?'Change email provider':'Connect an email provider'}</summary>
      <label>Provider<select value={kf.emailMode||''} onChange={e=>setKf(x=>({...x,emailMode:e.target.value}))}><option value="">Not set</option><option value="resend">Resend (free tier)</option><option value="smtp">SMTP (Gmail app password, Zoho, Brevo, any host)</option><option value="http">Custom email API (any HTTP service)</option></select></label>
      {kf.emailMode==='resend'&&<>{secretIn('resend','apiKey','Resend API key',keys.resend.apiKeySaved,keys.resend.apiKeyHint)}{textIn('resend','from','Send from','onboarding@resend.dev')}</>}
      {kf.emailMode==='smtp'&&<><div className="notify-two">{textIn('smtp','host','SMTP server','smtp.gmail.com')}<label>Port<select value={kf.smtp?.port||587} onChange={e=>setK('smtp','port',e.target.value)}><option value="587">587 (STARTTLS)</option><option value="465">465 (SSL)</option><option value="2525">2525</option><option value="25">25</option></select></label></div>
        <label className="check-label"><input type="checkbox" checked={Boolean(kf.smtp?.secure)} onChange={e=>setK('smtp','secure',e.target.checked)}/> Use SSL from the start (port 465)</label>
        <div className="notify-two">{textIn('smtp','user','Username','you@gmail.com')}{secretIn('smtp','pass','Password or app password',keys.smtp.passSaved)}</div>{textIn('smtp','from','Send from','Digital Shop <you@gmail.com>')}</>}
      {kf.emailMode==='http'&&httpFields('emailHttp',keys.emailHttp,false)}
      <div className="notify-actions">{(kf.emailMode||state.email.configured)&&<button type="button" className="btn btn-green btn-small" disabled={Boolean(busy)} onClick={()=>saveProvider('email')}><Busy active={busy==='k-email'}>{kf.emailMode?'Save email provider':'Remove email provider'}</Busy></button>}</div></details>
    <label className="check-label"><input type="checkbox" disabled={!state.email.configured && !set.ownerWelcomeEmails} checked={Boolean(set.ownerWelcomeEmails)} onChange={e=>setSet(x=>({...x,ownerWelcomeEmails:e.target.checked}))}/> Email newly created store admins their login details and shop links</label><label>New-owner welcome email contents<select value={set.welcomeEmailMode||'credentials'} onChange={e=>setSet(x=>({...x,welcomeEmailMode:e.target.value}))}><option value="credentials">Username + creation password + admin & storefront links</option><option value="setup">One-time set-password link (safer) + admin & storefront links</option></select></label><p className="muted">Credential mode emails the password entered at creation. Email can be forwarded or compromised; tell the owner to change it immediately. Passwords are never saved as plain text. Later Welcome email resends always use a one-time setup link because saved passwords cannot be recovered.</p>
    <label className="check-label"><input type="checkbox" checked={set.emailAlerts} onChange={e=>setSet(x=>({...x,emailAlerts:e.target.checked}))}/> Email me for every new-store request</label>
    <label>Alert email<input type="email" value={set.alertEmail} onChange={e=>setSet(x=>({...x,alertEmail:e.target.value}))} placeholder="you@example.com"/></label>
    <div className="notify-row"><strong>SMS</strong>{badge(state.sms)}</div>
    <details className="notify-provider"><summary>{state.sms.configured?'Change SMS provider':'Connect an SMS provider'}</summary>
      <label>Provider<select value={kf.smsMode||''} onChange={e=>setKf(x=>({...x,smsMode:e.target.value}))}><option value="">Not set</option><option value="fast2sms">Fast2SMS (India)</option><option value="http">Custom SMS API (MSG91, Twilio, Textlocal, any gateway)</option></select></label>
      {kf.smsMode==='fast2sms'&&<>{secretIn('fast2sms','apiKey','Fast2SMS API key',keys.fast2sms.apiKeySaved,keys.fast2sms.apiKeyHint)}<label>Route<select value={kf.fast2sms?.route||'quick'} onChange={e=>setK('fast2sms','route',e.target.value)}><option value="quick">Quick (no DLT)</option><option value="dlt">DLT (approved template)</option></select></label>
        {kf.fast2sms?.route==='dlt'&&<div className="notify-two">{textIn('fast2sms','senderId','DLT sender ID','ABCDEF')}{textIn('fast2sms','templateId','DLT message ID','123456')}</div>}</>}
      {kf.smsMode==='http'&&httpFields('smsHttp',keys.smsHttp,true)}
      <div className="notify-actions">{(kf.smsMode||state.sms.configured)&&<button type="button" className="btn btn-green btn-small" disabled={Boolean(busy)} onClick={()=>saveProvider('sms')}><Busy active={busy==='k-sms'}>{kf.smsMode?'Save SMS provider':'Remove SMS provider'}</Busy></button>}</div></details>
    <label className="check-label"><input type="checkbox" checked={set.smsAlerts} onChange={e=>setSet(x=>({...x,smsAlerts:e.target.checked}))}/> Text me for every new-store request</label>
    <label>Alert mobile number <small>(10-digit Indian number)</small><input type="tel" inputMode="numeric" value={set.alertPhone} onChange={e=>setSet(x=>({...x,alertPhone:e.target.value}))} placeholder="98765 43210"/></label>
    {msg?.ok&&<p className="notice success">{msg.ok}</p>}{msg?.error&&<p className="notice error">{msg.error}</p>}
    <div className="notify-actions">
      <button type="button" className="btn btn-green" disabled={Boolean(busy)} onClick={saveSettings}><Busy active={busy==='settings'}>Save alert settings</Busy></button>
      <button type="button" className="btn btn-outline btn-small" disabled={Boolean(busy)||!state.email.configured||!set.alertEmail} onClick={()=>test('email')}>Send test email</button>
      <button type="button" className="btn btn-outline btn-small" disabled={Boolean(busy)||!state.sms.configured||!set.alertPhone} onClick={()=>test('sms')}>Send test SMS</button>
    </div>
    <p className="muted">Save the alert email or number first, then send a test. Tests send only to what you saved.</p>
  </div>;
}
