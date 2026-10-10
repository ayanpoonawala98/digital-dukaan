import { ot } from './owner-i18n.js';
import { st, storefrontActive } from './storefront-i18n.js';
// Shared widgets choose the active surface, never translating customer-entered values.
export const pt = (text, values) => storefrontActive() ? st(text, values) : ot(text, values);
