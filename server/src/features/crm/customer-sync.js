import { Customer, CustomerDevice, crmEnabled } from './crm.js';
import { orderPhone, cleanOrderEmail, orderAmount, deviceLabel } from './customer-pure.js';

// Called after every order or enquiry is saved. Never throws: a customer-book problem must not fail an order.
// Dedupes by phone per store. Orders without a usable phone are skipped (no way to tell people apart).
export async function recordCustomerOrder(businessId, order) {
  try {
    if (!crmEnabled()) return null;
    const phone = orderPhone(order?.customerPhone);
    if (!phone) return null;
    const name = String(order.customerName || '').trim().slice(0, 100), email = cleanOrderEmail(order.customerEmail);
    const [customer] = await Customer.findOrCreate({ where: { businessId, phone }, defaults: { businessId, phone, name, email, source: 'order' } });
    if (customer.archivedAt) return null; // admin removed this person; do not bring them back
    const changes = { lastOrderAt: new Date() };
    if (!customer.name && name) changes.name = name;
    if (email) changes.email = email;
    await customer.increment({ orderCount: 1, totalSpent: orderAmount(order) });
    await customer.update(changes);
    return customer;
  } catch (err) { console.error('Customer record failed', { businessId, message: err.message }); return null; }
}

// Attach a browser push subscription to the customer who placed this order. Many devices per customer.
export async function attachCustomerDevice(businessId, order, push, userAgent) {
  try {
    if (!crmEnabled() || !push?.endpoint) return null;
    const phone = orderPhone(order?.customerPhone);
    if (!phone) return null;
    // The order write is fire-and-forget, so the record may not exist yet: create it without counting.
    const [customer] = await Customer.findOrCreate({ where: { businessId, phone }, defaults: { businessId, phone, name: String(order.customerName || '').trim().slice(0, 100), email: cleanOrderEmail(order.customerEmail), source: 'order' } });
    if (customer.archivedAt) return null;
    const label = deviceLabel(userAgent);
    const [device, created] = await CustomerDevice.findOrCreate({ where: { businessId, endpoint: push.endpoint }, defaults: { businessId, customerId: customer.id, keys: push.keys, label, lastSeenAt: new Date() } });
    if (!created) await device.update({ customerId: customer.id, keys: push.keys, label, lastSeenAt: new Date() });
    return device;
  } catch (err) { console.error('Customer device save failed', { businessId, message: err.message }); return null; }
}
export const removeCustomerDevice = async (businessId, endpoint) => {
  try { if (crmEnabled() && endpoint) await CustomerDevice.destroy({ where: { businessId, endpoint } }); } catch (err) { console.error('Customer device remove failed', err.message); }
};
