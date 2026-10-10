import webpush from 'web-push';
import { isAllowedPushEndpoint } from './abuse-limits.js';

// Every outgoing Web Push goes through here. Rows saved before the allow-list existed
// must never make the server call an arbitrary URL.
export function sendPush(sub, payload, options, send = webpush.sendNotification.bind(webpush)) {
  if (!sub || !isAllowedPushEndpoint(sub.endpoint)) {
    const err = new Error('Push endpoint is not an allowed push service');
    err.statusCode = 410; // callers already drop a subscription on 404/410
    return Promise.reject(err);
  }
  return send(sub, payload, options);
}
