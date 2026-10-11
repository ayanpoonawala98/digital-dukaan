// Pure rules for "Edit items": lowering or removing lines of a restaurant order the Kitchen has not accepted yet.
// No database here. The route runs this inside one transaction while holding the order row lock.
// Adding more food is a different action ("Add items") and stays allowed after acceptance; this never raises a quantity.
export const DISCOUNT_REFUSAL = "These items total less than the order's existing discount. Keep enough items to cover the discount, or cancel the order.";
export class EditRefused extends Error { constructor(status, message) { super(message); this.status = status; } }

// Why an order can no longer be edited, or '' when it still can. Each reason is specific so staff are told the truth.
export function editLockReason(order) {
  if (order.billId) return 'This order is already billed, so it can no longer be edited.';
  if (order.status === 'cancelled') return 'This order is cancelled, so it can no longer be edited.';
  if (String(order.paymentStatus || '').toLowerCase() === 'paid') return 'This order is already paid online, so it can no longer be edited.';
  if (['delivered', 'picked-up', 'served'].includes(order.status)) return 'This order is already completed, so it can no longer be edited.';
  if (order.status !== 'new') return 'The kitchen has already accepted this order, so its items are locked. Use Add items to order more.';
  return '';
}

// lines: [{ idx, qty }] with qty 0 = remove. Returns the new items array. Throws EditRefused(400) on bad input.
export function applyEdit(items, lines) {
  const current = Array.isArray(items) ? items.map(i => ({ ...i })) : [];
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) throw new EditRefused(400, 'Nothing to change');
  const seen = new Set();
  for (const l of lines) {
    const idx = Number(l?.idx), qty = Number(l?.qty);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) throw new EditRefused(400, 'That item is no longer on the order. Reload and try again.');
    if (!Number.isInteger(qty) || qty < 0 || qty > 99) throw new EditRefused(400, 'Invalid quantity');
    if (seen.has(idx)) throw new EditRefused(400, 'Invalid items');
    seen.add(idx);
    if (qty > Number(current[idx].qty)) throw new EditRefused(400, 'Edit items can only lower or remove items. Use Add items to order more.');
    current[idx].qty = qty;
  }
  const next = current.filter(i => Number(i.qty) > 0);
  if (!next.length) throw new EditRefused(400, 'That would remove every item. Cancel the order instead.');
  if (next.length === current.length && next.every((i, n) => Number(i.qty) === Number(items[current.indexOf(i)]?.qty))) throw new EditRefused(400, 'Nothing changed');
  return next;
}

// New money for the edited lines. Money rules (PM-ruled):
// - Delivery fee: NO-INCREASE. New fee = min(fee saved on the order, fee under the store's current settings for the new
//   subtotal). A saved zero stays zero; table/dine-in/counter orders carry none and cannot gain one. An edit may reduce or
//   waive a fee, never add or raise one. The rule an order was placed under is not stored, so today's settings can only lower it.
// - Discount: the saved discount is never changed or clamped. If the new item subtotal would be BELOW it, the edit is refused
//   (subtotal == discount is allowed). Coupons are NOT re-applied. Taxes are billing-time, so the base is items only.
export function editedTotals(order, next, store = {}) {
  const subtotal = Number(next.reduce((a, i) => a + Number(i.price) * Number(i.qty), 0).toFixed(2));
  const saved = Math.max(0, Number(order.deliveryFee || 0));
  let deliveryFee = saved;
  if (order.orderType === 'delivery' && saved > 0) {
    const free = store.freeDeliveryAbove !== null && store.freeDeliveryAbove !== undefined && subtotal >= Number(store.freeDeliveryAbove);
    deliveryFee = Math.min(saved, free ? 0 : Math.max(0, Number(store.deliveryCharge || 0)));
  }
  const discount = Math.max(0, Number(order.discount || 0));
  if (subtotal < discount) throw new EditRefused(409, DISCOUNT_REFUSAL);
  const total = Math.max(0, Number((subtotal - discount + deliveryFee).toFixed(2)));
  return { subtotal, discount, deliveryFee, total };
}
