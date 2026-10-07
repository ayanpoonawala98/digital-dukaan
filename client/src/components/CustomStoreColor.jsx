import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { normalizeHexColor, storeThemeStyle } from '../lib/store-theme.js';

export default function CustomStoreColor({ value, onChange }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const color = normalizeHexColor(value);
  return <div className="custom-store-color">
    <div className="custom-color-heading"><label htmlFor="custom-shop-color">Custom hex color</label><button type="button" className="color-info-button" aria-label="How to use a custom hex color" aria-expanded={helpOpen} aria-controls="custom-color-help" onClick={() => setHelpOpen(open => !open)}><Info size={18}/></button></div>
    {helpOpen && <div id="custom-color-help" className="custom-color-help"><strong>Use any color you like</strong><ol><li>Search online for a "hex color picker", or use the color picker below. Copy the code for your color, for example #7C3AED.</li><li>Paste it into Custom hex color. Use 6 letters/numbers (0-9, A-F); a starting # is optional. Short codes like #ABC work too.</li><li>Check the preview, then tap "Save shop settings". Your storefront and dashboard will use the color after saving.</li></ol><p>Only the theme changes. Your products and images stay the same.</p></div>}
    <div className="custom-color-controls"><input aria-label="Choose a custom color" type="color" value={color || '#0e9f6e'} onChange={event => onChange(event.target.value)}/><input id="custom-shop-color" value={value} onChange={event => onChange(event.target.value)} onBlur={() => { if (color) onChange(color); }} placeholder="#7C3AED" autoComplete="off" spellCheck={false} maxLength={16} required pattern={'\\s*#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\s*'} aria-invalid={!color} aria-describedby="custom-color-status"/></div>
    <small id="custom-color-status" className={color ? 'muted' : 'custom-color-error'}>{color ? `${color.toUpperCase()} - preview only until you save.` : 'Enter a valid hex color, such as #7C3AED or #ABC.'}</small>
    {color && <div className="custom-color-preview" style={storeThemeStyle(color)} aria-label="Custom color preview"><span className="custom-color-preview-dot"/><div><strong>Your shop theme</strong><small>Buttons, highlights and store accents</small></div><span className="btn btn-green btn-small">Shop now</span></div>}
  </div>;
}
