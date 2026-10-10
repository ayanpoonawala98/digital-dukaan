import React, { useEffect, useState } from 'react';
import { LayoutGrid, BookOpen } from 'lucide-react';

const key = slug => `dd-menu-view:${slug}`;
export function useMenuView(slug) {
  const [view, setView] = useState(() => { try { return localStorage.getItem(key(slug)) === 'menu' ? 'menu' : 'catalog'; } catch { return 'catalog'; } });
  useEffect(() => { try { setView(localStorage.getItem(key(slug)) === 'menu' ? 'menu' : 'catalog'); } catch { /* storage blocked */ } }, [slug]);
  const change = next => { setView(next); try { localStorage.setItem(key(slug), next); } catch { /* storage blocked */ } };
  return [view, change];
}

export function MenuViewSwitch({ view, onChange }) {
  return <div className="view-switch" role="group" aria-label="Menu layout" data-view={view}>
    <span className="view-switch-thumb" aria-hidden="true"/>
    <button type="button" className={view === 'catalog' ? 'on' : ''} aria-pressed={view === 'catalog'} onClick={() => onChange('catalog')}><LayoutGrid size={16}/><span>Cards</span></button>
    <button type="button" className={view === 'menu' ? 'on' : ''} aria-pressed={view === 'menu'} onClick={() => onChange('menu')}><BookOpen size={16}/><span>Menu</span></button>
  </div>;
}

export function groupByCategory(products) {
  const groups = [], index = new Map();
  for (const p of products) {
    const name = p.category?.name || 'More';
    if (!index.has(name)) { index.set(name, groups.length); groups.push({ name, items: [] }); }
    groups[index.get(name)].items.push(p);
  }
  return groups;
}
