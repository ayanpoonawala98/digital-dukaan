import {download} from './api.js';
import {notify} from './notifications.js';
const BASE=import.meta.env.VITE_API_URL||'';
export async function downloadShopCard(slug,format='png') {
 if(format==='pdf')return download(`/public/stores/${encodeURIComponent(slug)}/business-card.pdf`,`${slug}-business-card.pdf`);
 let source;
 try {
  const res=await fetch(`${BASE}/api/public/stores/${encodeURIComponent(slug)}/qr`);if(!res.ok)throw Error('Card download failed. Please try again.');
  source=URL.createObjectURL(await res.blob());
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Card image could not load. Please try again.'));img.src=source;});
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  canvas.getContext('2d').drawImage(img,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Card download failed. Please try again.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${slug}-business-card.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('success','Download started.');
 }catch(err){notify('error',err.message);throw err;}finally{if(source)URL.revokeObjectURL(source);}
}
