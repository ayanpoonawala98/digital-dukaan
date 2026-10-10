// Automatic open/close. The manual isOpen tick always wins: unticked means closed.
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function nowMinutesIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}
export function withinHours(openTime, closeTime, minutes) {
  if (!TIME_RE.test(openTime || '') || !TIME_RE.test(closeTime || '')) return true;
  const a = toMin(openTime), b = toMin(closeTime);
  if (a === b) return true;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}
export function effectiveOpen(b, date = new Date()) {
  if (b.isOpen === false) return false;
  if (!b.autoHours) return true;
  return withinHours(b.openTime, b.closeTime, nowMinutesIST(date));
}
// Hard close: no orders while closed. Defaults to on for restaurants, off for other shops.
export const blocksOrders = (b, date = new Date()) => !effectiveOpen(b, date) && (b.blockWhenClosed ?? b.storeType === 'restaurant');
export function publicBusiness(b, date = new Date()) {
  const json = typeof b.toJSON === 'function' ? b.toJSON() : { ...b };
  return { ...json, isOpen: effectiveOpen(b, date), blocksOrders: blocksOrders(b, date) };
}
