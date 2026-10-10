import React, { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../app/auth.jsx';
import { hostedStoreSlug } from '../../features/storefront/store-domain.js';
import { refreshStorefrontLanguage, registerStorefrontMessages, storefrontValidationMessage, storefrontLanguageSnapshot, subscribeStorefrontLanguage, setStorefrontLanguage, st } from '../lib/storefront-i18n.js';
import { storefrontMessages } from '../lib/storefront-messages.js';
registerStorefrontMessages(storefrontMessages);
export const useStorefrontLanguage = () => useSyncExternalStore(subscribeStorefrontLanguage,storefrontLanguageSnapshot,()=> 'en');
export function StorefrontLocale({children}) {
  const location = useLocation(), {session} = useAuth();
  const enabled = /^\/store(?:\/|$)/.test(location.pathname) || Boolean(hostedStoreSlug()) && (location.pathname === '/' || /^\/product\//.test(location.pathname));
  React.useMemo(() => refreshStorefrontLanguage(enabled,session?.user),[enabled,session?.user]);
  const language = useStorefrontLanguage();
  useEffect(() => {
    if (!enabled) return;
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    document.documentElement.dataset.storefrontLanguage = language;
    const invalid = event => {
      const field = event.target;
      if (!field.validity || field.validity.valid) return;
      field.setCustomValidity('');
      if(language !== 'en') {
        // Validation rules are shared; translation is selected from the storefront dictionary.
        field.setCustomValidity(storefrontValidationMessage(field.validity,field));
      }
    };
    const reset = event => event.target.setCustomValidity?.('');
    document.addEventListener('invalid',invalid,true);document.addEventListener('input',reset,true);document.addEventListener('change',reset,true);
    document.querySelectorAll('input,select,textarea').forEach(field=>field.setCustomValidity(''));
    return () => { document.documentElement.lang=previous;delete document.documentElement.dataset.storefrontLanguage;document.removeEventListener('invalid',invalid,true);document.removeEventListener('input',reset,true);document.removeEventListener('change',reset,true); };
  },[enabled,language]);
  return children;
}
export function StorefrontLanguage() {
  const language=useStorefrontLanguage();
  return <label className="language-select"><span>Language / भाषा / भाषा निवडा</span><select aria-label={st('Storefront language')} value={language} onChange={e=>setStorefrontLanguage(e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>;
}
