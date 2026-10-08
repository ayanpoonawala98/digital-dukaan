import webpush from 'web-push';
import { OwnerPushSubscription } from './models/index.js';
import { notifyOwnerNewOrder } from './order-push.js';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@digitaldukaan.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

// Fire-and-forget wrapper used by the public order routes; push failures never fail orders.
export const notifyOwnerDevices = (store, kind, order) =>
  notifyOwnerNewOrder({ store, kind, order, OwnerPushSubscription, send: (sub, payload) => webpush.sendNotification(sub, payload), configured: configured(), log: (msg, m) => console.error(msg, m) });
