export async function notifyNewProduct({store,product,PushSubscription,send,configured,log=()=>{}}){
 if(String(product.businessId)!==String(store.id))return {sent:0,total:0,skipped:true};
 if(!product.active || (product.kind!=='service' && product.stock===0))return {sent:0,total:0,skipped:true};
 try{
  const subs=await PushSubscription.findAll({where:{businessId:store.id}});
  if(!subs.length)return {sent:0,total:0};
  if(!configured)return {sent:0,total:subs.length,skipped:true};
  const payload=JSON.stringify({title:`New launch at ${store.name}`.slice(0,80),body:`${product.name} - ₹${product.price}. Tap to view.`.slice(0,200),url:`/store/${store.slug}/product/${product.id}`});
  let sent=0;
  for(const sub of subs){try{await send({endpoint:sub.endpoint,keys:sub.keys},payload);sent++;}catch(err){if(err.statusCode===404||err.statusCode===410)await sub.destroy();else log('New product push failed',err.message);}}
  return {sent,total:subs.length};
 }catch(err){log('New product push failed',err.message);return {sent:0,error:true};}
}
