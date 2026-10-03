import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
const secret = () => process.env.INVOICE_LINK_SECRET || process.env.JWT_SECRET || '';
// Links signed before INVOICE_LINK_SECRET existed used JWT_SECRET; keep accepting them.
const secrets = () => [...new Set([process.env.INVOICE_LINK_SECRET, process.env.JWT_SECRET].filter(Boolean))];
const sigWith = (key, kind, id) => crypto.createHmac('sha256', key).update(`bill:${kind}:${id}`).digest('hex').slice(0, 32);
export const invoiceSig = (kind, id) => sigWith(secret(), kind, id);
export function invoiceSigValid(kind, id, sig) {
  const b = Buffer.from(String(sig || ''));
  let ok = false;
  for (const key of secrets()) { const a = Buffer.from(sigWith(key, kind, id)); if (a.length === b.length && crypto.timingSafeEqual(a, b)) ok = true; }
  return ok;
}
export const invoiceUrl = (base, kind, id) => `${String(base).replace(/\/$/, '')}/api/public/bill/${kind}/${id}/${invoiceSig(kind, id)}`;

// Customer-facing order bill. Not a GST tax invoice, and says so unless the shop has a GSTIN on file.
export function streamBill(res, shop, order, kind = 'lead') {
  const items = kind === 'restaurant' ? (order.items || []) : (Array.isArray(order.items) && order.items.length ? order.items : [{ name: order.productName, qty: 1, price: order.price }]);
  const total = Number(kind === 'restaurant' ? order.total : order.price) || 0;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="bill-${kind === 'restaurant' ? 'R' : 'O'}${order.id}.pdf"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  const doc = new PDFDocument({ margin: 50, size: 'A4' }); doc.pipe(res);
  doc.fontSize(20).fillColor('#000').text(shop.name);
  if (shop.location) doc.fontSize(10).fillColor('#666').text(shop.location);
  if (shop.gstin) doc.fontSize(10).fillColor('#666').text(`GSTIN: ${shop.gstin}`);
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#000').text('ORDER BILL', { align: 'right' });
  doc.fontSize(10).fillColor('#666').text(`Order #${order.id}`, { align: 'right' }).text(new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), { align: 'right' });
  if (order.paymentStatus === 'paid') doc.fontSize(11).fillColor('#0e9f6e').text('PAID ONLINE', { align: 'right' });
  doc.moveDown(1);
  let y = doc.y; const row = (n, q, p, a, h) => { doc.fontSize(10).fillColor(h ? '#666' : '#000'); doc.text(String(n), 50, y, { width: 265 }); doc.text(String(q), 325, y, { width: 50, align: 'right' }); doc.text(String(p), 390, y, { width: 70, align: 'right' }); doc.text(String(a), 470, y, { width: 75, align: 'right' }); y += 26; };
  row('ITEM', 'QTY', 'PRICE', 'AMOUNT', true);
  let sub = 0;
  for (const it of items) { if (y > 690) { doc.addPage(); y = 50; row('ITEM', 'QTY', 'PRICE', 'AMOUNT', true); } const q = Number(it.qty) || 1, p = Number(it.price) || 0; sub += q * p; row(String(it.name || 'Item').slice(0, 45), q, `Rs.${p.toFixed(2)}`, `Rs.${(q * p).toFixed(2)}`); }
  if (y > 640) { doc.addPage(); y = 50; }
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke(); y += 14;
  const tr = (l, a) => { doc.fontSize(11).fillColor('#000').text(l, 330, y, { width: 130 }); doc.text(a, 470, y, { width: 75, align: 'right' }); y += 22; };
  tr('Subtotal', `Rs.${sub.toFixed(2)}`);
  const disc = Math.max(0, Number(order.discount) || 0); if (disc) tr(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `-Rs.${disc.toFixed(2)}`);
  const extra = Math.max(0, total - sub + disc); if (extra > 0.009) tr('Delivery / other', `Rs.${extra.toFixed(2)}`);
  tr('Total', `Rs.${total.toFixed(2)}`);
  doc.fontSize(8).fillColor('#777').text(shop.gstin ? 'Amounts as recorded by the shop for this order.' : 'This is the shop\'s order bill. It is not a GST tax invoice.', 50, y + 24, { width: 495, align: 'center' });
  doc.end();
}
