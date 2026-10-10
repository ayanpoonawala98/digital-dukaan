import React, { useEffect, useSyncExternalStore } from 'react';
import { ownerLanguageSnapshot, setOwnerLanguage, subscribeOwnerLanguage } from '../lib/owner-i18n.js';
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
  return <label className="owner-language"><span>Language / भाषा</span><select aria-label="Dashboard language" value={language} onChange={e => setOwnerLanguage(e.target.value, session.user)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>;
}
