// Use the number the customer sees on their confirmation, never the database key
// unless the order predates store-facing numbers. Preserve existing status wording.
export const customerOrderPushTitle = (store, order) => `Order #${order.orderNumber ?? order.id} at ${store.name}`;

import { reviewableProducts, isFinished } from '../reviews/reviews-pure.js';
export { isFinished };
// Deep link into the review section of the private tracking page. Keeps the token; adds review=1 so the page scrolls to it.
export const reviewPath = path => (typeof path === 'string' && path.includes('#token=') && !/[#&]review=1/.test(path) ? `${path}&review=1` : path);
// One notification per status change. When the order is finished and has items to rate, it doubles as the "rate your order" invite
// instead of sending a second push right behind it.
export function statusPush({ store, order, flow, label, returnPath, icon, image }) {
  const invite = reviewableProducts(order, flow).length > 0;
  return {
    title: customerOrderPushTitle(store, order),
    body: invite ? `${label} How was it? Tap to rate your order.` : `${label} Tap to view.`,
    url: invite ? reviewPath(returnPath) : returnPath,
    ...(icon ? { icon } : {}), ...(image ? { image } : {})
  };
}
