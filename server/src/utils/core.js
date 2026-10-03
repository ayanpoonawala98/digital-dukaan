export const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
export const validPhone = value => typeof value === 'string' && /^[1-9]\d{7,14}$/.test(value);
export const validPrice = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const escapeLike = value => String(value).replace(/[\\%_]/g, c => `\\${c}`);
export function whatsappUrl({ whatsapp }, product, photoUrl, answers = []) {
  const lines = [`Hi! I'm interested in this product:`, `ID: ${product.id || product._id}`, `Name: ${product.name}`, `Price: ₹${Number(product.price).toFixed(2)}`];
  for (const a of answers) if (a?.label && a?.value) lines.push(`${a.label}: ${a.value}`);
  if (photoUrl) lines.push(`Photo: ${photoUrl}`);
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}
export function whatsappCartUrl(business, lines, subtotal, delivery, total, shopUrl, couponCode = null, discount = 0) {
  const rows = [`Hi ${business.name}! I'd like to order:`, ''];
  for (const line of lines) {
    rows.push(`- ${line.qty} x ${line.name} = Rs.${(line.qty * line.price).toFixed(2)}`);
    for (const a of line.answers || []) if (a?.label && a?.value) rows.push(`   ${a.label}: ${a.value}`);
  }
  rows.push('', `Subtotal: Rs.${subtotal.toFixed(2)}`);
  if (couponCode) rows.push(`Coupon ${couponCode}: -Rs.${discount.toFixed(2)}`);
  rows.push(delivery > 0 ? `Delivery: Rs.${delivery.toFixed(2)}` : 'Delivery: FREE');
  rows.push(`Total: Rs.${total.toFixed(2)}`);
  if (business.upiId) rows.push(`UPI: ${business.upiId}`);
  if (shopUrl) rows.push('', `Shop: ${shopUrl}`);
  return `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(rows.join('\n'))}`;
}
export function publicImageUrl(url, apiBase) {
  if (!url) return '';
  return url.startsWith('/uploads/') ? `${apiBase.replace(/\/$/, '')}${url}` : url;
}
export const bad = (status, message) => Object.assign(new Error(message), { status });
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
