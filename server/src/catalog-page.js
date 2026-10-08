import { Op } from 'sequelize';
export function catalogCursor(query) {
 if (query.limit === undefined) return null; // Keep full catalogue consumers/exports compatible.
 const limit = Number(query.limit);
 if (limit !== 15) throw Object.assign(Error('Use batches of 15 products'), {status:400});
 let cursor = null;
 if (query.cursor) {
  try { cursor=JSON.parse(Buffer.from(String(query.cursor),'base64url').toString()); } catch {}
  if (!cursor || !Number.isInteger(cursor.id) || cursor.id<1 || typeof cursor.featured!=='boolean' || !Number.isFinite(Date.parse(cursor.createdAt))) throw Object.assign(Error('Invalid product cursor'), {status:400});
 }
 return {limit,cursor};
}
export function afterCatalogCursor(cursor) {
 if (!cursor) return {};
 const lower=[{featured:cursor.featured,createdAt:{[Op.lt]:new Date(cursor.createdAt)}},{featured:cursor.featured,createdAt:new Date(cursor.createdAt),id:{[Op.lt]:cursor.id}}];
 if(cursor.featured)lower.unshift({featured:false});
 return {[Op.or]:lower};
}
export function catalogResult(rows,total) {
 const products=rows.slice(0,15);const last=products.at(-1);const hasMore=rows.length>15;
 return {products,total,hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({id:last.id,featured:Boolean(last.featured),createdAt:last.createdAt})).toString('base64url'):null};
}
