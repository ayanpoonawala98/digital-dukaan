import { ot } from '../../shared/lib/owner-i18n.js';
import React,{useState} from 'react';
import {downloadShopCard} from '../storefront/shop-card-download.js';
export default function ShopQr({business,token,storeId}){
 const [busy,setBusy]=useState(false);if(!business)return null;
 return <section className="dashboard-panel qr-download-panel"><div><span className="kicker">{ot("YOUR COUNTER DISPLAY")}</span><h3>{ot("Download your business card")}</h3><p>{ot("Your store logo, contact details and QR in a printable card. Save an image to share or a PDF to print.")}</p><button className="btn btn-green" disabled={busy} onClick={async()=>{setBusy(true);try{await downloadShopCard(business.slug,'pdf');}catch{}finally{setBusy(false);}}}>{busy?ot("Preparing..."):ot("Download card PDF")}</button><button className="btn btn-outline" disabled={busy} onClick={async()=>{setBusy(true);try{await downloadShopCard(business.slug,'png');}catch{}finally{setBusy(false);}}}>{ot("Download card image")}</button></div></section>;
}
