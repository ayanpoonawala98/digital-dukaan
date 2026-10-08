import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import {loadShopLogo} from './shop-logo.js';
import {CardSerif, CardSansBold} from './card-fonts.js';
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

// A single layout for customer bills and owner estimates. Stored totals stay authoritative.
export function billModel(order, kind = 'lead') {
  const source = Array.isArray(order.items) && order.items.length ? order.items : [{ name: order.productName, qty: 1, price: order.price }];
  const items = source.map(it => ({ name: String(it.name || 'Item'), qty: Number(it.qty) || 1, price: Number(it.price) || 0 }));
  const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const total = Number(kind === 'restaurant' ? order.total : order.price) || 0;
  const discount = Math.max(0, Number(order.discount) || 0);
  return { items, subtotal, total, discount, adjustment: total - subtotal + discount };
}
export function createBillDocument(shop, order, kind = 'lead', { estimate = false, logo = null } = {}) {
  const m = billModel(order, kind);
  const doc = new PDFDocument({ margin: 44, size: 'A4', bufferPages: true, info: { Title: `${estimate ? 'Order estimate' : 'Order bill'} #${order.orderNumber ?? order.id}`, Author: String(shop.name || 'Digital Shop') } });
  doc.registerFont('Body', new URL('../fonts/DejaVuSans.ttf', import.meta.url).pathname);
  doc.registerFont('Display', CardSerif);
  doc.registerFont('Strong', CardSansBold);
  const ink = '#251f21', muted = '#585254', teal = '#46796b', rule = '#eae9ea', pale = '#f4efec';
  const money = n => `${Number(n) < 0 ? '-' : ''}₹${Math.abs(Number(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = (value, x, y, width, size = 10, color = ink, font = 'Body', align = 'left') => doc.font(font).fontSize(size).fillColor(color).text(String(value), x, y, { width, align, lineGap: 3 });
  const line = y => doc.moveTo(44, y).lineTo(551, y).lineWidth(.7).strokeColor(rule).stroke();
  const pageHeader = continuation => {
    doc.rect(0, 0, 595.28, 7).fill(teal);
    text('DIGITAL SHOP  /  '+(estimate ? 'ORDER ESTIMATE' : 'ORDER BILL'), 44, 33, 350, 9, teal, 'Strong');
    if (continuation) { text(`${shop.name}  ·  Continued`, 44, 55, 375, 14, ink, 'Display'); line(87); return 103; }
    doc.font('Display').fontSize(25);
    const nameH = doc.heightOfString(String(shop.name || 'Shop'), { width: 330, lineGap: 3 });
    if (logo) { try { doc.image(logo, 44, 64, { fit: [42, 42], align: 'center', valign: 'center' }); } catch {} }
    text(shop.name || 'Shop', logo ? 99 : 44, 65, logo ? 275 : 330, 25, ink, 'Display');
    text(`#${order.orderNumber ?? order.id}`, 405, 64, 146, 22, ink, 'Strong', 'right');
    const date = new Date(order.createdAt);
    text(Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })+' IST', 377, 95, 174, 8, muted, 'Body', 'right');
    let y = Math.max(116, 70 + nameH);
    if (shop.location) { doc.font('Body').fontSize(9); const h = doc.heightOfString(String(shop.location), { width: 330, lineGap: 3 }); text(shop.location, 44, y, 330, 9, muted); y += h + 6; }
    if (shop.gstin) { text(`GSTIN: ${shop.gstin}`, 44, y, 330, 9, muted); y += 18; }
    y += 12; line(y); y += 18;
    text('ORDER DETAILS', 44, y, 200, 8, muted, 'Strong');
    const labels = { new: 'Placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', 'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', preparing: 'Preparing', served: 'Served', completed: 'Completed', 'in-progress': 'In progress' };
    text(labels[order.status] || String(order.status || 'Placed'), 44, y + 19, 190, 11, ink, 'Strong');
    text(estimate ? 'Estimate only' : order.paymentStatus === 'paid' ? 'Paid online' : 'Payment not recorded as paid', 276, y + 19, 275, 10, order.paymentStatus === 'paid' && !estimate ? teal : muted, 'Body', 'right');
    return y + 55;
  };
  const tableHeader = y => { doc.roundedRect(44, y, 507, 29, 5).fill(pale); text('ITEM', 55, y + 8, 245, 8, muted, 'Strong'); text('QTY', 311, y + 8, 35, 8, muted, 'Strong', 'right'); text('UNIT PRICE', 355, y + 8, 83, 8, muted, 'Strong', 'right'); text('AMOUNT', 448, y + 8, 92, 8, muted, 'Strong', 'right'); return y + 40; };
  let y = tableHeader(pageHeader(false));
  for (const it of m.items) {
    // Split unusually long names rather than cutting away the ordered item.
    const words = it.name.split(/\s+/); let chunk = '';
    const chunks = [];
    for (const word of words) { const candidate = chunk ? chunk+' '+word : word; doc.font('Body').fontSize(10); if (doc.heightOfString(candidate, { width: 240, lineGap: 3 }) > 310 && chunk) { chunks.push(chunk); chunk = word; } else chunk = candidate; }
    chunks.push(chunk);
    for (let part = 0; part < chunks.length; part++) {
      doc.font('Body').fontSize(10); const h = Math.max(38, doc.heightOfString(chunks[part], { width: 240, lineGap: 3 }) + 18);
      if (y + h > 695) { doc.addPage(); y = tableHeader(pageHeader(true)); }
      text(chunks[part], 55, y + 4, 240, 10);
      if (part === 0) { text(it.qty, 305, y + 4, 41, 10, ink, 'Body', 'right'); text(money(it.price), 352, y + 4, 86, 9, ink, 'Body', 'right'); text(money(it.qty * it.price), 443, y + 4, 97, 9, ink, 'Body', 'right'); }
      y += h; line(y - 7);
    }
  }
  const totalsH = 130 + (m.discount ? 22 : 0) + (Math.abs(m.adjustment) > .009 ? 22 : 0);
  if (y + totalsH > 715) { doc.addPage(); y = pageHeader(true); }
  y += 15;
  const totalRow = (label, amount) => { text(label, 292, y, 150, 10, muted); text(money(amount), 442, y, 98, 10, ink, 'Body', 'right'); y += 24; };
  totalRow('Subtotal', m.subtotal);
  if (m.discount) totalRow('Discount', -m.discount);
  if (Math.abs(m.adjustment) > .009) totalRow(m.adjustment > 0 ? 'Delivery / other' : 'Order adjustment', m.adjustment);
  doc.roundedRect(284, y + 3, 267, 49, 6).fill(teal);
  text(estimate ? 'Estimated total' : 'Total', 299, y + 18, 118, 12, '#ffffff', 'Strong'); text(money(m.total), 410, y + 18, 126, 13, '#ffffff', 'Body', 'right');
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); line(747); text(estimate ? 'Order estimate only. This is not a tax invoice or payment receipt.' : 'Order bill only. This is not a GST tax invoice.', 44, 761, 420, 8, muted); text(`Page ${i + 1} of ${range.count}`, 466, 761, 85, 8, muted, 'Body', 'right'); text('Amounts as recorded by the shop. All times shown in IST.', 44, 778, 507, 7, muted); }
  return doc;
}
export async function streamBill(res, shop, order, kind = 'lead', options = {}) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${options.estimate ? 'attachment' : 'inline'}; filename="${options.estimate ? 'estimate' : 'bill'}-${kind === 'restaurant' ? 'R' : 'O'}${order.id}.pdf"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  const logo = await loadShopLogo(shop);
  const doc = createBillDocument(shop, order, kind, { ...options, logo }); doc.pipe(res); doc.end();
}
