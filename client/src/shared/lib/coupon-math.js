// Mirrors the server: total = subtotal - discount + delivery. The order itself is always recomputed by the server.
export const totalAfterCoupon = (subtotal, discount, delivery = 0) => Math.max(0, Math.round((Number(subtotal) - Number(discount || 0) + Number(delivery || 0)) * 100) / 100);
export const cleanCode = v => String(v || '').trim().toUpperCase();
export const validCodeShape = v => /^[A-Z0-9-]{3,24}$/.test(cleanCode(v));
