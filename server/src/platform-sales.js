import { DataTypes, Op } from 'sequelize';
import { sequelize, Business, User, Lead, RestaurantOrder } from './models/index.js';
import { dateWhere, dateWindow, csvCell } from './reporting.js';
import { bad } from './utils/core.js';
export const CommissionRule = sequelize.define('CommissionRule', {
  businessId:{type:DataTypes.INTEGER,allowNull:false}, percent:{type:DataTypes.DECIMAL(5,2),allowNull:false}, effectiveFrom:{type:DataTypes.DATEONLY,allowNull:false}, createdBy:{type:DataTypes.INTEGER,allowNull:false}
}, {tableName:'commission_rules',updatedAt:false,indexes:[{unique:true,fields:['businessId','effectiveFrom']}]});
let ready;
export const ensureCommissionSchema=()=>ready ||= CommissionRule.sync().catch(e=>{ready=null;throw e;});
const money=n=>Math.round((Number(n)||0)*100)/100;
const day=date=>new Date(+new Date(date)+330*60000).toISOString().slice(0,10);
export function aggregateSales(stores,owners,leads,orders,rules) {
  const ownersById=new Map(owners.map(o=>[o.id,o]));
  const rows=new Map(stores.map(s=>[s.id,{id:s.id,name:s.name,slug:s.slug,ownerId:s.ownerId,ownerName:ownersById.get(s.ownerId)?.name||'Unknown',ownerEmail:ownersById.get(s.ownerId)?.email||'',storeType:s.storeType,sales:0,completed:0,requests:0,pendingValue:0,cancelled:0,commission:0,paidSales:0}]));
  const products=new Map(),daily=new Map();
  for(const o of [...leads.map(o=>({...o,kind:'lead',total:o.price})),...orders.map(o=>({...o,kind:'restaurant'}))]) {
    const row=rows.get(o.businessId);if(!row)continue;
    if(o.status==='cancelled'){row.cancelled++;continue;}
    const complete=o.kind==='restaurant'?o.status==='served':['delivered','completed'].includes(o.status);
    if(!complete){row.requests++;row.pendingValue+=money(o.total);continue;}
    const total=money(o.total),date=day(o.createdAt);
    const applicable=rules.filter(r=>r.businessId===o.businessId&&r.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const commission=money(total*Number(applicable?.percent||0)/100);
    row.sales+=total;row.completed++;row.commission+=commission;if(o.paymentStatus==='paid')row.paidSales+=total;
    const d=daily.get(date)||{date,sales:0,orders:0,commission:0};d.sales+=total;d.orders++;d.commission+=commission;daily.set(date,d);
    for(const item of o.items?.length?o.items:[{name:o.productName||'Item',qty:1,price:o.total}]) {
      const key=`${o.businessId}:${item.productId||item.name}`;const p=products.get(key)||{storeId:o.businessId,storeName:row.name,name:item.name,units:0,itemValue:0};p.units+=Number(item.qty)||0;p.itemValue+=money(Number(item.qty)*Number(item.price));products.set(key,p);
    }
  }
  const list=[...rows.values()].map(r=>({...r,sales:money(r.sales),pendingValue:money(r.pendingValue),commission:money(r.commission),paidSales:money(r.paidSales)}));
  const totals=list.reduce((a,r)=>{for(const k of ['sales','completed','requests','pendingValue','cancelled','commission','paidSales'])a[k]+=r[k];return a;},{sales:0,completed:0,requests:0,pendingValue:0,cancelled:0,commission:0,paidSales:0});
  return {totals,stores:list.sort((a,b)=>b.sales-a.sales),products:[...products.values()].map(p=>({...p,itemValue:money(p.itemValue)})).sort((a,b)=>b.units-a.units),daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),rules};
}
export async function platformSales(query={}) {
  dateWindow(query);const numeric=v=>{if(!v)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw bad(400,'Choose a valid store or owner');return n;};
  const storeId=numeric(query.storeId),ownerId=numeric(query.ownerId);
  const storeWhere={...(storeId?{id:storeId}:{}),...(ownerId?{ownerId}:{})};
  const allStores=await Business.findAll({attributes:['id','name','slug','ownerId','storeType','deletedAt'],raw:true});
  const stores=allStores.filter(s=>(!storeId||s.id===storeId)&&(!ownerId||s.ownerId===ownerId));
  const owners=await User.findAll({where:{role:'owner'},attributes:['id','name','email'],raw:true});
  const ids=stores.map(s=>s.id),where={businessId:{[Op.in]:ids},...dateWhere(query,Op)};
  const counts=await Promise.all([Lead.count({where}),RestaurantOrder.count({where})]);
  if(counts.reduce((a,b)=>a+b,0)>100000)throw bad(400,'Choose a smaller period or a single store (100,000 record limit).');
  await ensureCommissionSchema();
  const attrs=['id','businessId','createdAt','status','items','paymentStatus'];
  const [leads,orders,rules]=await Promise.all([Lead.findAll({where,attributes:[...attrs,'price','productName'],raw:true}),RestaurantOrder.findAll({where,attributes:[...attrs,'total'],raw:true}),CommissionRule.findAll({where:{businessId:{[Op.in]:ids}},raw:true})]);
  return {...aggregateSales(stores,owners,leads,orders,rules),owners,allStores,from:query.from||null,to:query.to||null,timezone:'Asia/Kolkata',caveat:'Recorded sales = delivered/completed retail or service orders and served restaurant orders. Dates use order creation in IST, not payment date. Pending WhatsApp requests are not sales. Product values are before discounts/delivery. Commission is an estimate on recorded order totals (including delivery, after discounts), not an invoice, verified payment, or automatic charge.'};
}
export function salesCsv(r) {
 const rows=[['Platform recorded sales / commission estimate'],['From IST',r.from||'All time'],['Through IST',r.to||'All time'],['Basis',r.caveat],[],['Store','Owner','Completed orders','Recorded sales INR','Paid flag INR','Pending requests','Pending value INR','Cancelled','Commission estimate INR'],...r.stores.map(s=>[s.name,s.ownerName,s.completed,s.sales,s.paidSales,s.requests,s.pendingValue,s.cancelled,s.commission]),[],['Store','Product','Units completed','Item value before discounts/delivery INR'],...r.products.map(p=>[p.storeName,p.name,p.units,p.itemValue]),[],['IST date','Recorded sales INR','Orders','Commission estimate INR'],...r.daily.map(d=>[d.date,d.sales,d.orders,d.commission])];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
