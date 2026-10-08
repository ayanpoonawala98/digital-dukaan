// Only the store's uploaded ImageKit folder is eligible. No external URL or redirects.
export function uploadedLogoUrl(business) {
 try {
  const u=new URL(business.logoUrl||'');
  const endpoint=new URL(process.env.IMAGEKIT_URL_ENDPOINT||'https://ik.imagekit.io/digitaldukaanayan');
  const root=process.env.IMAGEKIT_UPLOAD_ROOT||'/digital-dukaan';
  const folder=`${endpoint.pathname.replace(/\/$/,'')}${root.startsWith('/')?root:'/'+root}/${business.id}/`;
  if(u.protocol!=='https:'||u.hostname!=='ik.imagekit.io'||u.username||u.password||u.port||!Number.isSafeInteger(Number(business.id))||Number(business.id)<1||!u.pathname.startsWith(folder)||!/^[-\w.]+\.(png|jpg|jpeg|webp)$/i.test(u.pathname.slice(folder.length)))return null;
  u.search='';u.hash='';u.searchParams.set('tr','w-120,h-120,cm-pad_resize,f-png');return u.href;
 }catch{return null;}
}
export async function loadShopLogo(business,fetcher=fetch) {
 const url=uploadedLogoUrl(business);if(!url)return null;
 try {
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!r.ok||!/^image\/png\b/i.test(r.headers.get('content-type')||'')||Number(r.headers.get('content-length'))>512*1024)return null;
  const chunks=[];let size=0;
  for await(const chunk of r.body){size+=chunk.length;if(size>512*1024){return null;}chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(w<1||h<1||w>512||h>512)return null;
  return bytes;
 }catch{return null;}
}
