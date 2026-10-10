// One automatic invitation per browser across all stores. The bell stays available.
export const PUSH_INVITE_KEY = 'dd-push-invite-v1';
let seenThisSession = false;
export function shouldInvite({ state, blocked = false, seen = false }) {
  return state === 'ask' && !blocked && !seen;
}
export function hasSeenPushInvite(storage = globalThis.localStorage) {
  try { return seenThisSession || Boolean(storage?.getItem(PUSH_INVITE_KEY)); } catch { return seenThisSession; }
}
export function rememberPushInvite(reason, storage = globalThis.localStorage) {
  seenThisSession = true;
  try { storage?.setItem(PUSH_INVITE_KEY, JSON.stringify({ reason, at: Date.now() })); } catch {}
}
