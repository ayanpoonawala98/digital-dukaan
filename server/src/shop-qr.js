import QRCode from 'qrcode';
export const qrBrand = business => {
 const color=/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(business.accentColor||'')?business.accentColor.slice(0,7):'#0e9f6e';
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const light=rgb.reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0)>.179;
 const name=String(business.name||'Digital Shop').trim();
 const initials=name.split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]||'').join('').toUpperCase();
 return {color,foreground:light?'#101611':'#ffffff',name,initials};
};
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const lines=(value,max=46,count=3)=>{
 const words=String(value||'').trim().split(/\s+/),out=[];let line='';
 for(const word of words){if((line+' '+word).trim().length>max&&line){out.push(line);line=word;}else line=(line+' '+word).trim();}
 if(line)out.push(line);return out.slice(0,count).map((v,i)=>i===count-1&&out.length>count?v.slice(0,max-3)+'...':v);
};
export async function shopQrSvg(business,destination,table){
 const b=qrBrand(business);
 const png=await QRCode.toBuffer(destination,{type:'png',margin:4,width:1024,errorCorrectionLevel:'H',color:{dark:'#162b1d',light:'#ffffff'}});
 const name=lines(b.name,16,3), description=lines(business.description,52,3),address=lines(business.location,48,3);
 const phone=String(business.whatsapp||'').replace(/[^+0-9]/g,'');
 const phoneLabel=phone.startsWith('91')&&phone.length===12?`+91 ${phone.slice(2,7)} ${phone.slice(7)}`:phone?`${phone.startsWith('+')?'':'+'}${phone}`:'';
 const rightX=758;
 let left=`<text x="50" y="60" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" font-weight="bold" fill="${b.color}">YOUR LOCAL ${business.storeType==='restaurant'?'RESTAURANT':business.storeType==='services'?'SERVICE BUSINESS':'STORE'}</text>`;
 name.forEach((v,i)=>left+=`<text x="50" y="${132+i*62}" font-family="Georgia,serif" font-size="${Math.min(56,600/Math.max(1,v.length*.62))}" fill="#162b1d">${escape(v)}</text>`);
 let y=155+name.length*62;left+=`<rect x="50" y="${y}" width="70" height="4" fill="${b.color}"/>`;y+=43;
 description.forEach(v=>{left+=`<text x="50" y="${y}" font-family="Arial,sans-serif" font-size="18" fill="#526156">${escape(v)}</text>`;y+=27;});y+=25;
 if(phoneLabel){left+=`<text x="50" y="${y}" font-family="Arial,sans-serif" font-size="11" letter-spacing="1.5" font-weight="bold" fill="${b.color}">WHATSAPP</text><text x="50" y="${y+28}" font-family="Arial,sans-serif" font-size="20" fill="#162b1d">${escape(phoneLabel)}</text>`;y+=70;}
 if(address.length){left+=`<text x="50" y="${y}" font-family="Arial,sans-serif" font-size="11" letter-spacing="1.5" font-weight="bold" fill="${b.color}">VISIT US</text>`;y+=28;address.forEach(v=>{left+=`<text x="50" y="${y}" font-family="Arial,sans-serif" font-size="18" fill="#162b1d">${escape(v)}</text>`;y+=26;});}
 const height=Math.max(700,y+70);
 const qrY=(height-470)/2+65;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="${height}" viewBox="0 0 1180 ${height}"><title>${escape(b.name)} business card QR code</title><rect x="3" y="3" width="1174" height="${height-6}" rx="26" fill="#fffdf8" stroke="${b.color}" stroke-width="4"/><path d="M700 5H1151Q1175 5 1175 29V${height-29}Q1175 ${height-5} 1151 ${height-5}H700Z" fill="${b.color}"/>${left}<text x="50" y="${height-30}" font-family="Arial,sans-serif" font-size="10" letter-spacing="1" fill="#6c786f">ONE SCAN. YOUR SHOP, ALWAYS WITH YOU.</text><text x="938" y="${qrY-30}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" letter-spacing="2" font-weight="bold" fill="${b.foreground}">${table?`TABLE ${table} - SCAN MENU`:'SCAN &amp; EXPLORE'}</text><rect x="${rightX}" y="${qrY}" width="360" height="360" rx="22" fill="white"/><image x="${rightX+8}" y="${qrY+8}" width="344" height="344" href="data:image/png;base64,${png.toString('base64')}"/><rect x="914" y="${qrY+156}" width="48" height="48" rx="10" fill="white"/><rect x="919" y="${qrY+161}" width="38" height="38" rx="8" fill="${b.color}"/><text x="938" y="${qrY+187}" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" font-weight="bold" fill="${b.foreground}">${escape(b.initials)}</text><text x="938" y="${qrY+398}" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="${b.foreground}">Our full collection. Right on your phone.</text><text x="938" y="${qrY+430}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="${b.foreground}">${escape(destination.replace(/^https?:\/\//,''))}</text></svg>`;
}
