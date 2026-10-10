import { useStorefrontLanguage } from './StorefrontLanguage.jsx';
import { pt as ot } from '../lib/presentation-i18n.js';
import { useOwnerLanguage } from './OwnerLanguage.jsx';
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { dismissToast, notify, subscribeToToasts, toastSnapshot } from '../../features/notifications/notifications.js';
export function useFeedbackState(initial = '') {
  const [value, setValue] = useState(initial);
  const setError = useCallback(next => {
    // Error setters in this app take strings, not state updater functions.
    setValue(next);
    if (typeof next === 'string' && next) notify('error', next);
  }, []);
  return [value, setError];
}
export default function Toasts() {
  useOwnerLanguage();
  useStorefrontLanguage();
  const items = useSyncExternalStore(subscribeToToasts, toastSnapshot, toastSnapshot);
  return <aside className="toast-stack" aria-label={ot("Application notifications")}>{items.map(item => <div className={`app-toast ${item.type}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'} aria-live={item.type === 'error' ? 'assertive' : 'polite'}>{item.type === 'error' ? <AlertCircle size={20}/> : <CheckCircle2 size={20}/>}<span>{ot(item.message)}</span><button type="button" onClick={() => dismissToast(item.id)} aria-label={ot("Dismiss notification")}><X size={18}/></button></div>)}</aside>;
}
