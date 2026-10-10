import { ot } from '../shared/lib/owner-i18n.js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const ThemeCtx = createContext({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('dd-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#12100d' : '#f8f5ee');
    try { localStorage.setItem('dd-theme', theme); } catch {}
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle({ className = '', showLabel = false }) {
  const { theme, toggle } = useTheme();
  return <button className={`theme-toggle ${className}`} onClick={toggle} aria-label={ot(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}{showLabel && <span>{ot(theme === 'dark' ? 'Light mode' : 'Dark mode')}</span>}</button>;
}
