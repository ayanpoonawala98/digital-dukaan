// New-order alerts to the store's own owner/staff devices. Never mixed with storefront
// subscriber pushes: no customer name, phone or address leaves in the notification.
export async function notifyOwnerNewOrder({ store, kind, order, OwnerPushSubscription, send, configured, log = () => {} }) {
  if (String(order.businessId) !== String(store.id)) return { sent: 0, total: 0, skipped: true };
  try {
    const subs = await OwnerPushSubscription.findAll({ where: { businessId: store.id } });
    if (!subs.length) return { sent: 0, total: 0 };
    if (!configured) return { sent: 0, total: subs.length, skipped: true };
    const number = order.orderNumber ?? order.id;
    const total = Number(order.total ?? order.price ?? 0);
    const tab = kind === 'restaurant' ? 'restaurant' : 'leads';
    const payload = JSON.stringify({ title: `New order at ${store.name}`.slice(0, 80), body: `Order #${number} - ₹${total}. Open your dashboard to review.`.slice(0, 200), url: `/dashboard?store=${store.slug}&tab=${tab}` });
    let sent = 0;
    for (const sub of subs) { try { await send({ endpoint: sub.endpoint, keys: sub.keys }, payload); sent++; } catch (err) { if (err.statusCode === 404 || err.statusCode === 410) await sub.destroy(); else log('Owner order push failed', err.message); } }
    return { sent, total: subs.length };
  } catch (err) { log('Owner order push failed', err.message); return { sent: 0, error: true }; }
}
