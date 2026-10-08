import React,{useState} from 'react';
import {api} from '../lib/api.js';
export default function PlatformEmailSummary({token}){
 const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const preview=async()=>{setBusy(true);setMessage('');try{setReport(await api('/admin/email-summary',{token}));}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 const send=async()=>{setBusy(true);try{const r=await api('/admin/email-summary',{token,method:'POST',body:{...report,confirm:true},feedback:false});setMessage(r.message);setReport(null);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 return <section className="dashboard-panel password-settings"><h3>Email platform summary</h3><p className="muted">Preview current store, account, product and request counts, then email them to your own superadmin address. Nothing sends automatically.</p><button type="button" className="btn btn-outline" disabled={busy} onClick={preview}>{busy?'Loading...':'Preview summary email'}</button>{report&&<div><p>To: <strong>{report.to}</strong></p><p>Subject: {report.subject}</p><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:13,lineHeight:1.7}}>{report.text}</pre><button type="button" className="btn btn-green" disabled={busy} onClick={send}>Confirm send to my email</button><button type="button" className="table-button" disabled={busy} onClick={()=>setReport(null)}>Cancel</button></div>}{message&&<p role="status">{message}</p>}</section>;
}
