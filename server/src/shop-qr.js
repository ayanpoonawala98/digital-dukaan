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
export async function shopQrSvg(business,destination,table){
 const b=qrBrand(business);
 const png=await QRCode.toBuffer(destination,{type:'png',margin:4,width:1024,errorCorrectionLevel:'H',color:{dark:'#162b1d',light:'#ffffff'}});
 const name=Array.from(b.name).length>34?Array.from(b.name).slice(0,31).join('')+'...':b.name;
 const title=table?`TABLE ${table} - SCAN TO OPEN MENU`:'SCAN TO EXPLORE OUR SHOP';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720" viewBox="0 0 600 720"><title>${escape(b.name)} QR code</title><rect x="5" y="5" width="590" height="710" rx="28" fill="white" stroke="${b.color}" stroke-width="6"/><rect x="22" y="22" width="556" height="68" rx="16" fill="${b.color}"/><text x="300" y="65" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="bold" fill="${b.foreground}">${escape(name)}</text><text x="300" y="123" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#162b1d">${title}</text><image x="35" y="135" width="530" height="530" href="data:image/png;base64,${png.toString('base64')}"/><rect x="276" y="376" width="48" height="48" rx="10" fill="white"/><rect x="281" y="381" width="38" height="38" rx="8" fill="${b.color}"/><text x="300" y="406" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" font-weight="bold" fill="${b.foreground}">${escape(b.initials)}</text><text x="300" y="686" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#162b1d">${escape(destination.replace(/^https?:\/\//,''))}</text></svg>`;
}
