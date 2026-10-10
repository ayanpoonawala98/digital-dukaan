export const PRODUCT_CSV_COLUMNS = ['name','price','stock','category','description'];
const cell = value => {
 let text = String(value ?? '');
 // Neutralize spreadsheet formulas in human-entered text.
 if (/^[=+@-]/.test(text)) text = "'" + text;
 return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
};
export function productsCsv(products) {
 return '\uFEFF' + [PRODUCT_CSV_COLUMNS.join(','),...products.map(p=>[p.name,p.price,p.stock,p.category?.name ?? p.category ?? 'Imported',p.description].map(cell).join(','))].join('\r\n')+'\r\n';
}
export function productCsvTemplate() {
 return productsCsv([{name:'Example product - replace before import',price:199,stock:10,category:'Example category',description:'Replace this row with your own product details'}]);
}
export function downloadProductCsv(text,filename) {
 const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
