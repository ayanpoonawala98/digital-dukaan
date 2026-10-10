let ownerMessages = new Map();
export function registerOwnerMessages(messages) { ownerMessages = new Map(Object.entries(messages)); }
export const OWNER_LANGUAGES = ['en', 'hi', 'mr'];
const listeners = new Set();
const preferences = new Map();
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
let cachedLanguage = 'en';
let cachedKey = null;
let dashboardActive = false;
export function refreshOwnerLanguage(user = currentUser()) {
  const previous = cachedLanguage;
  dashboardActive = typeof window !== 'undefined' && /^\/dashboard(?:\/|$)/.test(window.location.pathname);
  cachedKey = ownerLanguageKey(user);
  try { cachedLanguage = dashboardActive ? preferences.get(cachedKey) || readOwnerLanguage(user, localStorage) : 'en'; } catch { cachedLanguage = 'en'; }
  if (previous !== cachedLanguage) listeners.forEach(fn => fn());
  return cachedLanguage;
}
refreshOwnerLanguage();
export function deactivateOwnerLanguage() { dashboardActive = false; cachedLanguage = 'en'; }
export const ownerLanguageSnapshot = () => cachedLanguage;
export const subscribeOwnerLanguage = fn => {
  refreshOwnerLanguage();
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function setOwnerLanguage(language, user = currentUser()) {
  const key = ownerLanguageKey(user);
  if (!key) return;
  const next = valid(language);
  preferences.set(key, next);
  try { localStorage.setItem(key, next); } catch { /* Private browsing may disallow persistence. */ }
  refreshOwnerLanguage(user);
  listeners.forEach(fn => fn());
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== 'dd-session' && event.key !== cachedKey) return;
    if (event.key === cachedKey || event.key === null) preferences.delete(cachedKey);
    refreshOwnerLanguage();
    listeners.forEach(fn => fn());
  });
  window.addEventListener('popstate', () => { refreshOwnerLanguage(); listeners.forEach(fn => fn()); });
}
export function translateOwner(language, text, variables = {}) {
  const translated = ownerMessages.get(text)?.[language] || text;
  if (!Object.keys(variables).length) return String(translated);
  return String(translated).replace(/(?<!\{)\{(\w+)\}(?!\})/g, (match, key) => Object.hasOwn(variables, key) ? String(variables[key]) : match);
}
// Used only for presentation. Never translate stored identifiers, API values or customer data.
export const ot = (text, variables) => translateOwner(ownerLanguageSnapshot(), text, variables);

// Only exact server-authored plan formats are translated. Amounts and dates stay unchanged.
export function translateOwnerPlan(language, text) {
  let match = /^Free trial: (\d+) (day|days) left \(ends ([^)]+)\)\.$/.exec(text);
  if (match) return translateOwner(language, `Free trial: {days} ${match[2]} left (ends {end}).`, { days: match[1], end: match[3] });
  match = /^(Payment due|Payment overdue) for (\d{4}-\d{2})\. Due ([^.]+)\. Pay Digital Shop and they will mark it paid\.$/.exec(text);
  if (match) return translateOwner(language, `${match[1]} for {month}. Due {due}. Pay Digital Shop and they will mark it paid.`, { month: match[2], due: match[3] });
  match = /^Paid for (\d{4}-\d{2})\. Thank you\.$/.exec(text);
  if (match) return translateOwner(language, 'Paid for {month}. Thank you.', { month: match[1] });
  return translateOwner(language, text);
}

export function validationMessage(validity, field, language = ownerLanguageSnapshot()) {
  const t = (text, values) => translateOwner(language, text, values);
  if (validity.valueMissing) return t('Please fill out this field.');
  if (validity.typeMismatch) return t(field.type === 'email' ? 'Please enter a valid email address.' : field.type === 'url' ? 'Please enter a valid URL.' : 'Please enter a valid value.');
  if (validity.rangeUnderflow) return t('Value must be at least {min}.', { min: field.min });
  if (validity.rangeOverflow) return t('Value must be at most {max}.', { max: field.max });
  if (validity.tooShort) return t('Please enter at least {min} characters.', { min: field.minLength });
  if (validity.patternMismatch) return t('Please use the requested format.');
  return t('Please enter a valid value.');
}
