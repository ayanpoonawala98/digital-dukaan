// Status flows per store type; must match server/src/order-flows.js.
export const FLOWS = {
  restaurant: { steps: [['new', 'Order received'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served']], done: ['served', 'delivered', 'picked-up', 'cancelled'],
    note: { new: 'The restaurant received your order. Waiting for the restaurant to accept it.', accepted: 'The restaurant accepted your order.', preparing: 'The restaurant is preparing your order.', ready: 'Your order is ready.', served: 'The restaurant marked this order served. This is not proof of payment.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'The restaurant marked this order delivered. This is not proof of payment.', 'picked-up': 'Marked as picked up. Thank you!', cancelled: 'Contact the restaurant if you have a question about this order.' } },
  retail: { steps: [['new', 'Placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out-for-delivery', 'Out for delivery'], ['delivered', 'Delivered']], done: ['delivered', 'cancelled'],
    note: { new: 'Your order request was sent to the shop. The shop will confirm it on WhatsApp.', confirmed: 'The shop confirmed your order.', packed: 'The shop packed your order.', shipped: 'Your order has shipped.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'The shop marked this order delivered.', cancelled: 'Contact the shop if you have a question about this order.' } },
  services: { steps: [['new', 'Booked'], ['confirmed', 'Confirmed'], ['in-progress', 'In progress'], ['completed', 'Completed']], done: ['completed', 'cancelled'],
    note: { new: 'Your booking request was sent. The provider will confirm it on WhatsApp.', confirmed: 'The provider confirmed your booking.', 'in-progress': 'Your service is in progress.', completed: 'The provider marked this service completed.', cancelled: 'Contact the provider if you have a question about this booking.' } }
};
export const flowKey = (kind, storeType) => (kind === 'restaurant' ? 'restaurant' : storeType === 'services' ? 'services' : 'retail');
const LAST = { 'dine-in': [['served', 'Served']], takeaway: [['picked-up', 'Picked up']], delivery: [['out-for-delivery', 'Out for delivery'], ['delivered', 'Delivered']] };
export const flowFor = (kind, storeType, orderType) => {
  const flow = FLOWS[flowKey(kind, storeType)];
  if (kind !== 'restaurant' || !LAST[orderType]) return flow;
  return { ...flow, steps: [...flow.steps.slice(0, 4), ...LAST[orderType]] };
};
const EXTRA = { served: 'Served', delivered: 'Delivered', 'picked-up': 'Picked up', 'out-for-delivery': 'Out for delivery' };
export const statusLabel = (flow, status) => status === 'cancelled' ? 'Cancelled' : (flow.steps.find(([k]) => k === status)?.[1] || EXTRA[status] || status);
export const leadStatusOptions = storeType => [...FLOWS[flowKey('lead', storeType)].steps, ['cancelled', 'Cancelled']];
