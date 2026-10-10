import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth.jsx';
import { api } from '../../shared/lib/api.js';
import Busy from '../../shared/components/Busy.jsx';
export default function ChangePassword() {
  const { session, save } = useAuth(), navigate = useNavigate();
  const [form,setForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async event=>{
    event.preventDefault(); setError('');
    if(form.newPassword!==form.confirmPassword){setError(ot("New passwords do not match."));return;}
    if(new TextEncoder().encode(form.newPassword).length>72){setError(ot("New password must be at most 72 bytes. Try fewer characters."));return;}
    setBusy(true);
    try { await api('/auth/change-password',{method:'POST',token:session.token,body:form,successMessage:'Password changed. Sign in with your new password.'});setForm({currentPassword:'',newPassword:'',confirmPassword:''});save(null);navigate('/login',{replace:true}); }
    catch(err){setError(err.message);}finally{setBusy(false);}
  };
  return <section className="dashboard-panel password-settings"><h3>{ot("Change password")}</h3><p className="muted">{ot("Changes your login password for all your stores, not just this shop. Your shop data stays the same. All existing sessions will be signed out.")}</p><form onSubmit={submit} className="password-change-form">{[['currentPassword',ot("Current password"),'current-password'],['newPassword',ot("New password"),'new-password'],['confirmPassword',ot("Confirm new password"),'new-password']].map(([key,label,complete])=><label key={key}>{label}<input type="password" autoComplete={complete} required minLength={key==='currentPassword'?undefined:12} maxLength={128} value={form[key]} disabled={busy} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<small className="muted">{ot("Use at least 12 characters. Longer phrases are easier to remember. Maximum 72 bytes.")}</small>{error&&<p role="alert" className="notice error">{ot(error)}</p>}<button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy?ot("Changing..."):ot("Change password")}</Busy></button></form><p className="muted">{ot("Forgot your current password? Contact the platform admin. Never share passwords in chat.")}</p></section>;
}
