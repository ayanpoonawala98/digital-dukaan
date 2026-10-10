import { dictionaries } from './i18n.js';
let messages = new Map();
export function registerStorefrontMessages(value) { messages = new Map(Object.entries(value)); }
export const STOREFRONT_LANGUAGES = ['en', 'hi', 'mr'];
const valid = value => STOREFRONT_LANGUAGES.includes(value) ? value : 'en';
const listeners = new Set(), preferences = new Map();
let language = 'en', key = null, active = false;
export function storefrontLanguageKey(user) { return user?.id != null ? `dd-storefront-language:${user.id}` : user?.email ? `dd-storefront-language:${user.email}` : 'dd-storefront-language:guest'; }
export function readStorefrontLanguage(user, storage) {
  const userKey = storefrontLanguageKey(user);
  try { return valid(storage?.getItem(userKey) || (userKey.endsWith(':guest') ? storage?.getItem('dd-language') : null)); } catch { return 'en'; }
}
export function refreshStorefrontLanguage(enabled, user) {
  active = enabled;
  key = storefrontLanguageKey(user);
  try { language = enabled ? preferences.get(key) || readStorefrontLanguage(user, localStorage) : 'en'; } catch { language = 'en'; }
  return language;
}
export const storefrontLanguageSnapshot = () => language;
export const storefrontActive = () => active;
export const subscribeStorefrontLanguage = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setStorefrontLanguage(value) {
  if (!active || !key) return;
  language = valid(value); preferences.set(key, language);
  try { localStorage.setItem(key, language); } catch { /* Keep the selection in memory if storage is blocked. */ }
  listeners.forEach(fn => fn());
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (!active || event.key !== null && event.key !== key && event.key !== 'dd-session' && event.key !== 'dd-language') return;
  let user = null; try { user = JSON.parse(localStorage.getItem('dd-session'))?.user; } catch { /* guest */ }
  preferences.delete(key); refreshStorefrontLanguage(active,user); listeners.forEach(fn=>fn());
});
export function translateStorefront(locale, text, variables = {}) {
  const translated = messages.get(text)?.[locale] || dictionaries[locale]?.[text] || dictionaries.en[text] || text;
  if (!Object.keys(variables).length) return String(translated);
  return String(translated).replace(/(?<!\{)\{(\w+)\}(?!\})/g,(match,name)=>Object.hasOwn(variables,name)?String(variables[name]):match);
}
export const st = (text, variables) => translateStorefront(language,text,variables);
export const storeLocale = () => ({en:'en-IN',hi:'hi-IN',mr:'mr-IN'}[language]);

export function storefrontValidationMessage(validity, field) {
  if(validity.valueMissing) return st('Please fill out this field.');
  if(validity.typeMismatch) return st(field.type==='email'?'Please enter a valid email address.':field.type==='url'?'Please enter a valid URL.':'Please enter a valid value.');
  if(validity.rangeUnderflow) return st('Value must be at least {min}.',{min:field.min});
  if(validity.rangeOverflow) return st('Value must be at most {max}.',{max:field.max});
  if(validity.tooShort) return st('Please enter at least {min} characters.',{min:field.minLength});
  if(validity.patternMismatch) return st('Please use the requested format.');
  return st('Please enter a valid value.');
}
