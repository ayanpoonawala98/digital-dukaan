import React,{useState} from 'react';
import {downloadShopCard} from '../lib/shop-card-download.js';
export default function ShopQr({business,token,storeId}){
 const [busy,setBusy]=useState(false);if(!business)return null;
 return <section className="dashboard-panel qr-download-panel"><div><span className="kicker">YOUR COUNTER DISPLAY</span><h3>Download your business card</h3><p>Your store logo, contact details and QR in a printable card. Save an image to share or a PDF to print.</p><button className="btn btn-green" disabled={busy} onClick={async()=>{setBusy(true);try{await downloadShopCard(business.slug,'pdf');}catch{}finally{setBusy(false);}}}>{busy?'Preparing...':'Download card PDF'}</button><button className="btn btn-outline" disabled={busy} onClick={async()=>{setBusy(true);try{await downloadShopCard(business.slug,'png');}catch{}finally{setBusy(false);}}}>Download card image</button></div></section>;
}
