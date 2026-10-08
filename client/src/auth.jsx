import React, { createContext, useContext, useState } from 'react';
const Auth = createContext(null);
export const useAuth = () => useContext(Auth);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('dd-session')); } catch { return null; } });
  const save = value => { setSession(value); value ? localStorage.setItem('dd-session', JSON.stringify(value)) : localStorage.removeItem('dd-session'); };
  return <Auth.Provider value={{ session, save }}>{children}</Auth.Provider>;
}
