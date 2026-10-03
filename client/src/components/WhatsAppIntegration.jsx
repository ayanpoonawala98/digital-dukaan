import { useFeedbackState } from './Toasts.jsx';
import React, {useEffect,useState,useRef} from 'react';
import {api} from '../lib/api.js';
import AutoReplyCard from './AutoReplyCard.jsx';
import WhatsAppInbox from './WhatsAppInbox.jsx';
import {loadMetaSdk,runEmbeddedSignup} from '../lib/whatsapp-signup.js';
export default function WhatsAppIntegration({token,storeId,staff}) {
  const [status,setStatus]=useState(null),[messages,setMessages]=useState([]),[error,setError]=useFeedbackState(''),[to,setTo]=useState(''),[text,setText]=useState(''),[review,setReview]=useState(null),[busy,setBusy]=useState(false);
  const [signupSession,setSignupSession]=useState(null);
  const stopSignup=useRef(null),generation=useRef(0),[sdkReady,setSdkReady]=useState(false);
  const selfServeComingSoon=true;
  const root=`/owner/${storeId}/whatsapp-cloud`;
  async function refresh(){
    const current=generation.current;setError('');
    try {const s=await api(`${root}/status`,{token});if(current!==generation.current)return;setStatus(s);if(!selfServeComingSoon&&s.signup?.available)loadMetaSdk(s.signup).then(()=>{if(current===generation.current)setSdkReady(true);}).catch(e=>{if(current===generation.current)setError(e.message);});}
    catch(e){if(current===generation.current)setError(e.message);}
  }
  useEffect(()=>{generation.current++;stopSignup.current?.();setStatus(null);setMessages([]);setReview(null);setBusy(false);setSdkReady(false);setSignupSession(null);refresh();return ()=>{generation.current++;stopSignup.current?.();};},[token,storeId]);
  async function prepareConnect(){
    if(busy||!sdkReady)return;setBusy(true);setError('');const current=generation.current;
    try {const config=await api(`${root}/connect/start`,{token,method:'POST',body:{}});if(current===generation.current)setSignupSession(config);}
    catch(e){if(current===generation.current)setError(e.message);}finally{if(current===generation.current)setBusy(false);}
  }
  function connect(){
    if(busy||!signupSession||!window.FB)return;setBusy(true);setError('');const current=generation.current,config=signupSession;
    // FB.login is called synchronously inside this click, avoiding popup blockers.
    stopSignup.current=runEmbeddedSignup(window.FB,config,{
      exchange:code=>api(`${root}/connect/exchange`,{token,method:'POST',body:{state:config.state,code}}),
      complete:assets=>api(`${root}/connect/complete`,{token,method:'POST',body:{state:config.state,...assets}}),
      onError:e=>{if(current===generation.current){setError(e.message);setBusy(false);setSignupSession(null);}},
      onSuccess:()=>{if(current===generation.current){setBusy(false);setSignupSession(null);refresh();}}
    });
  }
  async function send(){
    if(!review||busy)return;setBusy(true);setError('');
    try {const result=await api(`${root}/send`,{token,method:'POST',body:{...review}});setReview(null);setText('');if(result.message?.status==='unknown'||result.message?.status==='submitting')setError('Delivery is unconfirmed. Do not retry with a new request.');await refresh();}
    catch(e){setError(e.message);setReview(null);}finally{setBusy(false);}
  }
  return <div className="dashboard-panel"><h3>WhatsApp production connection</h3><p>Reply to people who have messaged the connected shop number in the past 24 hours. These text replies are free. Paid templates, auto-replies and campaigns are not enabled here.</p>{error&&<p className="notice error" role="alert">{error}</p>}{!status&&!error&&<p role="status">Loading connection...</p>}{!staff&&selfServeComingSoon&&<section style={{border:'1px solid var(--line)',padding:18,marginBottom:20}}><h4>Connect your shop's WhatsApp</h4><p>Connect your own number and manage customer messages from your shop inbox.</p><button className="btn" disabled aria-label="Connect with Meta - Coming soon">Connect with Meta - Coming soon</button><p>New shop connections will be available after Meta verification and approval. Existing connected inboxes can still receive messages and send replies.</p></section>}{status&&<>{!selfServeComingSoon&&!staff&&!status.merchantConnected&&status.signup?.available&&<section style={{border:'1px solid var(--line)',padding:18,marginBottom:20}}><h4>Connect your shop's WhatsApp</h4><p>Use Meta's secure signup to choose your business account and verify your own number. Messages sent to that number will appear in this shop's inbox, and replies will use that number.</p><p>Meta may require business verification and a payment method in your own WhatsApp account. This dashboard only allows free replies within 24 hours of a customer's message. It does not enable paid templates or campaigns.</p><p>Connecting registers your verified number for Cloud API and sets a securely managed two-step verification PIN. Your storefront order destination will not change automatically. Existing WhatsApp app numbers may require Meta's migration or coexistence flow; do not move a working number without checking Meta's guidance.</p>{status.connectionState==='needs_attention'||status.connectionState==='pending'?<p role="status">A previous connection needs attention. Contact support before trying again.</p>:status.signup?.available?<button className="btn" onClick={signupSession?connect:prepareConnect} disabled={busy||!sdkReady}>{busy?'Connecting in Meta...':!sdkReady?'Loading Meta login...':signupSession?'Continue with Meta':'Connect my WhatsApp'}</button>:<p role="status">Self-serve connection is being prepared. Meta setup and approval must be complete before new shops can connect here.</p>}</section>}{status.connectionState==='expired'&&<p className="notice error">Meta access has expired. Contact support to reconnect before sending replies.</p>}<dl><dt>Connected number</dt><dd>{status.sender||'Not configured'}</dd><dt>Webhook</dt><dd style={{overflowWrap:'anywhere'}}>{status.callback||'Not configured'}</dd><dt>Signed events</dt><dd>{status.cloudEnabled?'Enabled':'Disabled'}</dd><dt>Outbound replies</dt><dd>{status.outboundEnabled?'Configured. Delivery still depends on Meta and the service window.':'Not ready'}</dd><dt>Inbox storage</dt><dd>{status.inboxEnabled?'Enabled':'Not configured'}</dd></dl><button className="btn" onClick={refresh} disabled={busy}>Refresh inbox</button>{status.inboxEnabled?<WhatsAppInbox token={token} root={root} canSend={Boolean(status.outboundEnabled)}/>:<p>Inbox is not configured for this shop.</p>}</>}{!staff&&status?.merchantConnected&&<AutoReplyCard token={token} storeId={storeId}/>}</div>;
}
