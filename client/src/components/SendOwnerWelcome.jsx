import React,{useState} from 'react';
import {api} from '../lib/api.js';
export default function SendOwnerWelcome({owner,token}){
 const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const send=async()=>{setBusy(true);try{const result=await api(`/admin/users/${owner.id}/welcome-email`,{method:'POST',token,body:{ownerEmail:owner.email,confirm:true},feedback:false});setMessage(result.welcomeEmail.message);setReview(false);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 return <div><button className="table-button" onClick={()=>setReview(!review)}>Welcome email</button>{review&&<div className="notice"><p>Send a new one-time set-password link to <strong>{owner.email}</strong>? Any older setup link will stop working. Their current password stays valid until they choose a new one.</p><button type="button" className="btn btn-green btn-small" disabled={busy} onClick={send}>{busy?'Sending...':'Confirm send'}</button><button type="button" className="table-button" disabled={busy} onClick={()=>setReview(false)}>Cancel</button></div>}{message&&<p role="status">{message}</p>}</div>;
}
