// Order status flows per store type. Restaurant orders live in restaurant_orders; retail and
// services orders are customer enquiries stored in leads. Customers and owners only ever see their own type's flow.
export const ORDER_FLOWS = {
  restaurant: { statuses: ['new', 'accepted', 'preparing', 'ready', 'served', 'out-for-delivery', 'delivered', 'picked-up', 'cancelled'], push: { accepted: 'The restaurant accepted your order.', preparing: 'Your order is being prepared.', ready: 'Your order is ready.', served: 'Your order is served.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'Your order was delivered.', 'picked-up': 'Thanks for picking up your order.', cancelled: 'Your order was cancelled.' } },
  retail: { statuses: ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'cancelled'], push: { confirmed: 'Your order is confirmed.', packed: 'Your order is packed.', shipped: 'Your order has shipped.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'Your order was delivered.', cancelled: 'Your order was cancelled.' } },
  services: { statuses: ['new', 'confirmed', 'in-progress', 'completed', 'cancelled'], push: { confirmed: 'Your booking is confirmed.', 'in-progress': 'Your service is in progress.', completed: 'Your service is completed.', cancelled: 'Your booking was cancelled.' } }
};
export const LEAD_STATUS_VALUES = ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'in-progress', 'completed', 'cancelled'];
export const flowKey = storeType => (storeType === 'restaurant' ? 'restaurant' : storeType === 'services' ? 'services' : 'retail');
export const flowFor = storeType => ORDER_FLOWS[flowKey(storeType)];

// Restaurant order progress depends on how the customer receives the order.
export const RESTAURANT_STEPS = {
  'dine-in': ['new', 'accepted', 'preparing', 'ready', 'served'],
  takeaway: ['new', 'accepted', 'preparing', 'ready', 'picked-up'],
  delivery: ['new', 'accepted', 'preparing', 'ready', 'out-for-delivery', 'delivered']
};
export const RESTAURANT_DONE = ['served', 'delivered', 'picked-up'];
export const RESTAURANT_STATUS_TEXT = { accepted: 'accepted', preparing: 'being prepared', ready: 'ready', served: 'served. Enjoy your meal!', 'out-for-delivery': 'out for delivery', delivered: 'delivered. Enjoy your meal!', 'picked-up': 'picked up. Thank you!', cancelled: 'cancelled' };
export const restaurantStatusAllowed = (orderType, status, current) => status === 'cancelled' || (RESTAURANT_STEPS[orderType] || RESTAURANT_STEPS['dine-in']).includes(status) || status === current;
