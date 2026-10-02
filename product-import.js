import { createHash } from 'node:crypto';
import { bad } from './utils/core.js';
export function validateProductRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw bad(400,'Import 1-500 products at a time');
  const seen = new Set(), errors = [], normalized = [];
  rows.forEach((row,i)=>{
    if(!row || typeof row !== 'object' || Array.isArray(row)) { errors.push({row:i+2,error:'Invalid product row'}); return; }
    const name=String(row.name || '').trim(), price=Number(row.price), stock=row.stock === '' || row.stock === undefined ? null : Number(row.stock), category=String(row.category || 'Imported').trim(), description=String(row.description || '').trim();
    if (!name || name.length>120) errors.push({row:i+2,error:'Product name is required (max 120 characters)'});
    if (row.price === '' || row.price === undefined || !Number.isFinite(price) || price<0 || price>1e8) errors.push({row:i+2,error:'Price must be a number from 0 to 100,000,000'});
    if (stock !== null && (!Number.isInteger(stock) || stock<0 || stock>1e7)) errors.push({row:i+2,error:'Stock must be a whole non-negative number or blank'});
    if(!category || category.length>80 || description.length>2000) errors.push({row:i+2,error:'Category max 80 characters; description max 2000'});
    if(seen.has(name.toLowerCase())) errors.push({row:i+2,error:'Duplicate product name in file'}); seen.add(name.toLowerCase());
    normalized.push({name,price,stock,category,description});
  });
  if(normalized.some(r=>!/[a-z0-9]/i.test(r.category))) errors.push({row:0,error:'Category must include a letter or number.'});
  const digest=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return {rows:normalized,errors,digest};
}
