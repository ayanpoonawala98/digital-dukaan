import { ot } from '../../shared/lib/owner-i18n.js';
import React, {useEffect,useState} from 'react';
import {api} from '../../shared/lib/api.js';
import {useFeedbackState} from '../../shared/components/Toasts.jsx';
// Owner-only, off by default. The shop owner writes the exact text; nothing is sent until it is switched on.
export default function AutoReplyCard({token,storeId,base='whatsapp-cloud'}) {
  const root=`/owner/${storeId}/${base}/auto-reply`;
  const [enabled,setEnabled]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useFeedbackState('');
  useEffect(()=>{let live=true;setLoaded(false);api(root,{token,feedback:false}).then(r=>{if(live){setEnabled(r.enabled);setText(r.text||'');setLoaded(true);}}).catch(e=>{if(live)setError(e.message);});return ()=>{live=false;};},[root,token]);
  async function save(next){
    if(busy)return;setBusy(true);setError('');
    try{const r=await api(root,{token,method:'PUT',body:{enabled:next,text},successMessage:next?'Auto-reply is on':'Auto-reply saved'});setEnabled(r.enabled);setText(r.text);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  if(!loaded)return error?<p className="error">{ot(error)}</p>:null;
  return <section className="dashboard-panel"><h3>{ot("Auto-reply")}</h3>
    <p className="muted">{ot("When a customer messages your shop number, send this text once. Each customer gets it at most once every 12 hours, only inside WhatsApp's free 24-hour window. It is off until you turn it on.")}</p>
    <label>{ot("Reply text")}<textarea value={text} maxLength={1000} rows={4} placeholder={ot("Write the message customers should get")} onChange={e=>setText(e.target.value)} /></label>
    <p className="muted">{text.length}/1000</p>
    {error&&<p className="error">{ot(error)}</p>}
    <div className="inline-form">
      <button className="btn btn-outline btn-small" disabled={busy||(enabled&&!text.trim())} onClick={()=>save(enabled)}>{ot("Save text")}</button>
      {enabled
        ? <button className="btn btn-outline btn-small" disabled={busy} onClick={()=>save(false)}>{ot("Turn off")}</button>
        : <button className="btn btn-green" disabled={busy||!text.trim()} onClick={()=>save(true)}>{ot("Turn on auto-reply")}</button>}
      <span className="muted">{enabled?ot("Status: ON"):ot("Status: OFF")}</span>
    </div>
  </section>;
}
