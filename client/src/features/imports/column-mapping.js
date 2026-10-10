const normal = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
export const IMPORT_FIELDS = {
  products:[{key:'name',label:'Product name',required:true,aliases:['item name','product name','name','item','product']},{key:'price',label:'Price',required:true,aliases:['price','sale price','selling price','rate','mrp','price/unit']},{key:'stock',label:'Stock',aliases:['stock','stock quantity','stock qty','quantity','qty']},{key:'category',label:'Category',aliases:['category','category name','group']},{key:'description',label:'Description',aliases:['description','item description']}],
  customers:[{key:'phone',label:'Phone with country code',required:true,aliases:['phone','mobile','phone number','mobile number','contact number','whatsapp']},{key:'name',label:'Customer name',aliases:['name','customer','customer name','full name']},{key:'source',label:'Source',aliases:['source']},{key:'notes',label:'Notes',aliases:['notes','note','remarks']}]
};
export function suggestMapping(headers,fields){return Object.fromEntries(fields.map(field=>{const matches=headers.filter(h=>field.aliases.some(a=>normal(a)===normal(h)));return[field.key,matches.length===1?matches[0]:''];}));}
export function mapRows(rows,mapping,fields){
  for(const f of fields) if(f.required&&!mapping[f.key]) throw Error(`Map the ${f.label} column first.`);
  const chosen=Object.values(mapping).filter(Boolean);if(new Set(chosen).size!==chosen.length)throw Error('A file column can only map to one field.');
  return rows.map(row=>Object.fromEntries(fields.filter(f=>mapping[f.key]).map(f=>[f.key,String(row[mapping[f.key]] ?? '').trim()])));
}
