// Use the number the customer sees on their confirmation, never the database key
// unless the order predates store-facing numbers. Preserve existing status wording.
export const customerOrderPushTitle = (store, order) => `Order #${order.orderNumber ?? order.id} at ${store.name}`;
