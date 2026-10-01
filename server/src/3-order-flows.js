// Order status flows per store type. Restaurant orders live in restaurant_orders; retail and
// services orders are customer enquiries stored in leads. Customers and owners only ever see their own type's flow.
export const ORDER_FLOWS = {
  restaurant: { statuses: ['new', 'preparing', 'served', 'cancelled'], push: { preparing: 'Your order is being prepared.', served: 'Your order is served.', cancelled: 'Your order was cancelled.' } },
  retail: { statuses: ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'cancelled'], push: { confirmed: 'Your order is confirmed.', packed: 'Your order is packed.', shipped: 'Your order has shipped.', 'out-for-delivery': 'Your order is out for delivery.', delivered: 'Your order was delivered.', cancelled: 'Your order was cancelled.' } },
  services: { statuses: ['new', 'confirmed', 'in-progress', 'completed', 'cancelled'], push: { confirmed: 'Your booking is confirmed.', 'in-progress': 'Your service is in progress.', completed: 'Your service is completed.', cancelled: 'Your booking was cancelled.' } }
};
export const LEAD_STATUS_VALUES = ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'in-progress', 'completed', 'cancelled'];
export const flowKey = storeType => (storeType === 'restaurant' ? 'restaurant' : storeType === 'services' ? 'services' : 'retail');
export const flowFor = storeType => ORDER_FLOWS[flowKey(storeType)];
