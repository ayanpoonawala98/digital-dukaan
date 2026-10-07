import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHexColor, storeThemeStyle, accentForeground, colorLuminance, STORE_THEMES } from './store-theme.js';
test('normalizes pasted six and three digit codes', () => { for (const [input,want] of [[' #AbC ','#aabbcc'],['7C3AED','#7c3aed'],['#000','#000000'],['fff','#ffffff']]) assert.equal(normalizeHexColor(input),want); });
test('rejects invalid hex, alpha values and CSS injection', () => { for (const input of ['', '#12', '#abcd', '#12345678', '#GGGGGG', 'red', '#000; color:red', null]) assert.equal(normalizeHexColor(input),null); });
test('arbitrary colors reach all theme surfaces in light and dark', () => { for (const dark of [false,true]) { const s=storeThemeStyle('#7c3aed',dark); assert.equal(s['--accent'],'#7c3aed'); for(const k of ['--accent-ink','--accent-soft','--store-sidebar','--store-banner','--welcome-start','--welcome-end']) assert.match(s[k],/^#[0-9a-f]{6}$/); } });
test('light and dark custom button colors have readable foregrounds', () => { for (const hex of ['#ffffff','#000000','#ffff00','#ff0000','#7c3aed','#aabbcc']) { const bg=colorLuminance(hex),fg=colorLuminance(accentForeground(hex)); assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=4.5); } });
test('custom ink contrasts with light/dark backgrounds',()=>{ for (const hex of ['#ffffff','#000000','#ffff00','#ff0000','#7c3aed']) for (const dark of [false,true]) { const ink=colorLuminance(storeThemeStyle(hex,dark)['--accent-ink']),bg=dark?.007:1; assert.ok((Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05)>=4.5); } });
test('existing presets and invalid fallbacks retained',()=>{ for(const p of STORE_THEMES) assert.ok(storeThemeStyle(p.color)); assert.equal(storeThemeStyle('bogus'),undefined); });
