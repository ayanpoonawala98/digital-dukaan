// Existing businesses.accentColor stores the selection; empty means the original green.
export const STORE_THEMES = [
  { name:'Original green', color:'#0e9f6e', ink:'#0b7d57', dark:'#2fbf8f', darkInk:'#4fd6a7', soft:'#e2f4ec', darkSoft:'#16352a', banner:'#173222', sidebar:'#14251a' },
  { name:'Ocean blue', color:'#225caa', ink:'#184c92', dark:'#81b8ff', darkInk:'#acd0ff', soft:'#e9f1ff', darkSoft:'#172c49', banner:'#173659', sidebar:'#122944' },
  { name:'Terracotta', color:'#ad5139', ink:'#923f2c', dark:'#ed9d84', darkInk:'#ffbda8', soft:'#fff0e9', darkSoft:'#432820', banner:'#632e23', sidebar:'#48281f' },
  { name:'Plum', color:'#7d4f91', ink:'#693b7d', dark:'#c6a0d7', darkInk:'#dcb9e9', soft:'#f4eafa', darkSoft:'#33213e', banner:'#472b51', sidebar:'#35223e' },
  { name:'Midnight', color:'#455b77', ink:'#344863', dark:'#a1b5cf', darkInk:'#c0d0e1', soft:'#ebf0f6', darkSoft:'#263341', banner:'#243950', sidebar:'#1d3043' },
  { name:'Saffron', color:'#94631d', ink:'#795016', dark:'#e4b86d', darkInk:'#f3cc87', soft:'#faf1df', darkSoft:'#3b311e', banner:'#634218', sidebar:'#3f301c' },
  { name:'Rose', color:'#9b4b68', ink:'#823754', dark:'#e5a1b8', darkInk:'#f6bfd0', soft:'#fbeaf0', darkSoft:'#412630', banner:'#62283e', sidebar:'#472634' },
  { name:'Sea glass', color:'#267977', ink:'#1d6461', dark:'#80c8c3', darkInk:'#a7e0db', soft:'#e8f5f1', darkSoft:'#203b39', banner:'#19524f', sidebar:'#173a38' },
  { name:'Cocoa', color:'#775c43', ink:'#644b35', dark:'#d1b493', darkInk:'#e9cbaa', soft:'#f4efe7', darkSoft:'#3b3027', banner:'#4e3927', sidebar:'#382c22' },
  { name:'Olive', color:'#68743b', ink:'#56602d', dark:'#b4c47e', darkInk:'#cfdda1', soft:'#f0f3e5', darkSoft:'#333b25', banner:'#444e26', sidebar:'#313921' }
];
export const storeThemeStyle = (accentColor, dark = false) => {
  const chosen = STORE_THEMES.find(t => t.color.toLowerCase() === String(accentColor || '').toLowerCase());
  if (!chosen) return /^#[0-9a-f]{6}$/i.test(String(accentColor || '')) ? { '--accent':accentColor, '--accent-ink':`color-mix(in srgb, ${accentColor} 75%, black)`, '--accent-soft':`color-mix(in srgb, ${accentColor} 12%, white)`, '--welcome-start':`color-mix(in srgb, ${accentColor} 55%, black)`, '--welcome-end':`color-mix(in srgb, ${accentColor} 90%, black)`, '--store-sidebar':`color-mix(in srgb, ${accentColor} 34%, #101611)`, '--store-banner':`color-mix(in srgb, ${accentColor} 57%, #101611)` } : undefined;
  if (chosen === STORE_THEMES[0]) return { '--accent':chosen.color, '--accent-ink':chosen.ink, '--accent-soft':chosen.soft };
  return { '--accent': dark ? chosen.dark : chosen.color, '--accent-ink': dark ? chosen.darkInk : chosen.ink, '--accent-soft': dark ? chosen.darkSoft : chosen.soft, '--store-banner': chosen.banner, '--store-sidebar': chosen.sidebar, '--welcome-start':chosen.banner, '--welcome-end':chosen.color };
};
