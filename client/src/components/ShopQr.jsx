import React,{useState} from 'react';
import {api,download} from '../lib/api.js';
export default function ShopQr({business,token,storeId}){
 const [busy,setBusy]=useState(false);if(!business)return null;
 return <section className="dashboard-panel qr-download-panel"><div><span className="kicker">YOUR COUNTER DISPLAY</span><h3>Print your shop QR</h3><p>Customers scan this to open your catalog. Download an A4 PDF and print it for your counter.</p><button className="btn btn-green" disabled={busy} onClick={async()=>{setBusy(true);try{await download(`/owner/${storeId}/shop-qr.pdf`,`${business.slug}-shop-qr.pdf`,token);}catch{}finally{setBusy(false);}}}>{busy?'Preparing...':'Download print-ready QR (PDF)'}</button></div></section>;
}
