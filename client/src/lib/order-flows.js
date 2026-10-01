// Status flows per store type; must match server/src/order-flows.js.
export const FLOWS = {
  restaurant: { steps: [['new', 'Order received'], ['preparing', 'Preparing'], ['served', 'Served']], done: ['served', 'cancelled'],
    note: { new: 'The restaurant received your order. Waiting for preparation.', preparing: 'The restaurant is preparing your order.', served: 'The restaurant marked this order served. This is not proof of payment.', cancelled: 'Contact the restaurant if you have a question about this order.' } },
  retail: { steps: [['new', 'Placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out-for-delivery', 'Out for delivery'], ['delivered', 'Delivered']], done: ['delivered', 'cancelled'],
    note: { new: 'Your order request was sent to the shop. The shop will confirm it on WhatsApp.', confirmed: 'The shop confirmed your order.', packed: 'The shop packed your order.', shipped: 'Your order has shipped.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'The shop marked this order delivered.', cancelled: 'Contact the shop if you have a question about this order.' } },
  services: { steps: [['new', 'Booked'], ['confirmed', 'Confirmed'], ['in-progress', 'In progress'], ['completed', 'Completed']], done: ['completed', 'cancelled'],
    note: { new: 'Your booking request was sent. The provider will confirm it on WhatsApp.', confirmed: 'The provider confirmed your booking.', 'in-progress': 'Your service is in progress.', completed: 'The provider marked this service completed.', cancelled: 'Contact the provider if you have a question about this booking.' } }
};
export const flowKey = (kind, storeType) => (kind === 'restaurant' ? 'restaurant' : storeType === 'services' ? 'services' : 'retail');
export const flowFor = (kind, storeType) => FLOWS[flowKey(kind, storeType)];
export const statusLabel = (flow, status) => status === 'cancelled' ? 'Cancelled' : (flow.steps.find(([k]) => k === status)?.[1] || status);
export const leadStatusOptions = storeType => [...FLOWS[flowKey('lead', storeType)].steps, ['cancelled', 'Cancelled']];
