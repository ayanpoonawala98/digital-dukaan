import React, { useEffect, useSyncExternalStore } from 'react';
import { ownerLanguageSnapshot, setOwnerLanguage, subscribeOwnerLanguage, validationMessage, ot } from '../lib/owner-i18n.js';
import { useAuth } from '../../app/auth.jsx';
export function useOwnerLanguage() {
  return useSyncExternalStore(subscribeOwnerLanguage, ownerLanguageSnapshot, () => 'en');
}
export function OwnerLanguage() {
  const language = useOwnerLanguage();
  const { session } = useAuth();
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    document.documentElement.dataset.ownerLanguage = language;
    return () => { document.documentElement.lang = previous; delete document.documentElement.dataset.ownerLanguage; };
  }, [language]);
  useEffect(() => {
    const invalid = event => {
      const field = event.target;
      if (!field.closest('.admin-layout') || !field.validity || field.validity.valid) return;
      field.setCustomValidity('');
      if (language !== 'en') field.setCustomValidity(validationMessage(field.validity, field, language));
    };
    const reset = event => event.target.setCustomValidity?.('');
    document.addEventListener('invalid', invalid, true);
    document.addEventListener('input', reset, true);
    document.addEventListener('change', reset, true);
    // Clear prior language errors when switching without editing the form.
    document.querySelectorAll('.admin-layout input, .admin-layout select, .admin-layout textarea').forEach(field => field.setCustomValidity(''));
    return () => { document.removeEventListener('invalid', invalid, true); document.removeEventListener('input', reset, true); document.removeEventListener('change', reset, true); };
  }, [language]);
  return <label className="owner-language"><span>Language / भाषा</span><select aria-label={ot("Dashboard language")} value={language} onChange={e => setOwnerLanguage(e.target.value, session.user)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>;
}
