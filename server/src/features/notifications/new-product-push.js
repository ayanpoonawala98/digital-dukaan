export function notificationImageUrl(value, apiBase = process.env.PUBLIC_API_URL || 'https://api.digitalshop.website') {
 if(typeof value !== 'string' || !value.trim())return '';
 try { const u = value.startsWith('/uploads/') ? new URL(value, apiBase) : new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export async function notifyNewProduct({store,product,PushSubscription,send,configured,log=()=>{}}){
 if(String(product.businessId)!==String(store.id))return {sent:0,total:0,skipped:true};
 if(!product.active || (product.kind!=='service' && product.stock===0))return {sent:0,total:0,skipped:true};
 try{
  const subs=await PushSubscription.findAll({where:{businessId:store.id}});
  if(!subs.length)return {sent:0,total:0};
  if(!configured)return {sent:0,total:subs.length,skipped:true};
  const image=[product.imageUrl,...(Array.isArray(product.imageUrls)?product.imageUrls:[])].map(u=>notificationImageUrl(u)).find(Boolean)||'';
  const icon=notificationImageUrl(store.logoUrl)||'/icon-192.png';
  const payload=JSON.stringify({title:`New launch at ${store.name}`.slice(0,80),body:`${product.name} - ₹${product.price}. Tap to view.`.slice(0,200),url:`/store/${store.slug}/product/${product.id}`,icon,badge:'/icon-192.png',...(image?{image}:{})});
  let sent=0;
  for(const sub of subs){try{await send({endpoint:sub.endpoint,keys:sub.keys},payload);sent++;}catch(err){if(err.statusCode===404||err.statusCode===410)await sub.destroy();else log('New product push failed',err.message);}}
  return {sent,total:subs.length};
 }catch(err){log('New product push failed',err.message);return {sent:0,error:true};}
}
