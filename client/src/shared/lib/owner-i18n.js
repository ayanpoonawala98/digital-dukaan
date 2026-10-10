import { ownerMessages } from './owner-messages.js';
export const OWNER_LANGUAGES = ['en', 'hi', 'mr'];
const listeners = new Set();
const valid = value => OWNER_LANGUAGES.includes(value) ? value : 'en';
export function ownerLanguageKey(user) {
  return user?.id != null ? `dd-owner-language:${user.id}` : user?.email ? `dd-owner-language:${user.email}` : null;
}
export function readOwnerLanguage(user, storage) {
  try { return valid(storage?.getItem(ownerLanguageKey(user))); } catch { return 'en'; }
}
function currentUser() {
  try { return JSON.parse(localStorage.getItem('dd-session'))?.user; } catch { return null; }
}
export function ownerLanguageSnapshot() {
  if (typeof window === 'undefined' || !/^\/dashboard(?:\/|$)/.test(window.location.pathname)) return 'en';
  try { return readOwnerLanguage(currentUser(), localStorage); } catch { return 'en'; }
}
export const subscribeOwnerLanguage = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setOwnerLanguage(language, user = currentUser()) {
  const key = ownerLanguageKey(user);
  if (!key) return;
  try { localStorage.setItem(key, valid(language)); } catch { /* Private browsing may disallow persistence. */ }
  listeners.forEach(fn => fn());
}
export function translateOwner(language, text, variables = {}) {
  const translated = ownerMessages[text]?.[language] || text;
  return String(translated).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(variables, key) ? String(variables[key]) : match);
}
// Used only for presentation. Never translate stored identifiers, API values or customer data.
export const ot = (text, variables) => translateOwner(ownerLanguageSnapshot(), text, variables);
