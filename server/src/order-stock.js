// Status-driven inventory changes. Managed transaction and order lock prevent repeat deductions.
export const RETAIL_DEDUCT=['confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed'];
export const RESTAURANT_DEDUCT=['preparing','ready','served','out-for-delivery','delivered','picked-up'];
const stockError=message=>Object.assign(Error(message),{status:409});
export function orderQuantities(order){
 const rows=Array.isArray(order.items)&&order.items.length?order.items:order.productId?[{productId:order.productId,qty:1}]:[];
 const quantities=new Map();
 for(const row of rows){const id=Number(row.productId??row.id),qty=Number(row.qty);if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(qty)||qty<1||qty>10000)throw stockError('Order items cannot be matched safely to inventory. Check this order before confirming.');quantities.set(id,(quantities.get(id)||0)+qty);}
 if(!quantities.size)throw stockError('This order has no current product links. Check inventory manually before confirming.');
 return [...quantities].sort((a,b)=>a[0]-b[0]).map(([productId,qty])=>({productId,qty}));
}
export async function updateOrderStock({sequelize,Order,Product,Ledger,businessId,orderId,kind,status,changes={},deductStatuses,grandfather}){
 return sequelize.transaction(async transaction=>{
  const order=await Order.findOne({where:{id:orderId,businessId},transaction,lock:transaction.LOCK.UPDATE});if(!order)return null;
  let ledger=await Ledger.findOne({where:{orderKind:kind,orderId,businessId},transaction,lock:transaction.LOCK.UPDATE});
  // No row is not evidence of a prior deduction. Explicit legacy handling is supplied by rollout.
  if(!ledger){ledger=await Ledger.create({businessId,orderId,orderKind:kind,deducted:[],legacy:grandfather(order)||!['new','cancelled'].includes(order.status)},{transaction});}
  const active=deductStatuses.includes(status||order.status),prior=Array.isArray(ledger.deducted)?ledger.deducted:[];
  if(!ledger.legacy&&status&&active&&!ledger.settled){
   const requested=orderQuantities(order),deducted=[];
   // Stable lock order prevents cross-order deadlocks. Check every product before any decrement.
   const products=[];
   for(const line of requested){const product=await Product.findOne({where:{id:line.productId,businessId},transaction,lock:transaction.LOCK.UPDATE});if(!product)throw stockError('A product in this order was deleted. Check inventory before confirming.');if(product.kind==='service'||product.stock===null)continue;if(!Number.isInteger(product.stock)||product.stock<line.qty)throw stockError(`Insufficient stock for ${product.name}. Restock or cancel this order.`);products.push([product,line]);}
   for(const [product,line] of products){await product.update({stock:product.stock-line.qty},{transaction});deducted.push(line);}
   // Track a settled deduction even when every item is unlimited/service, preventing re-evaluation.
   await ledger.update({deducted,settled:true},{transaction});
  }else if(!ledger.legacy&&status&&!active&&ledger.settled){
   for(const line of prior.slice().sort((a,b)=>a.productId-b.productId)){
    const product=await Product.findOne({where:{id:line.productId,businessId},transaction,lock:transaction.LOCK.UPDATE});
    if(product&&product.kind!=='service'&&product.stock!==null){if(!Number.isInteger(product.stock)||product.stock+line.qty>2147483647)throw stockError('Restored stock would exceed the stock limit. Check inventory first.');await product.update({stock:product.stock+line.qty},{transaction});}
   }
   await ledger.update({deducted:[],settled:false},{transaction});
  }
  const previousStatus=order.status;await order.update({...changes,...(status?{status}:{})},{transaction});
  return {order,changed:previousStatus!==order.status};
 });
}
