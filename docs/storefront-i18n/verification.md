# Storefront language verification

Base: origin/main b09c68e. Branch: feat/storefront-i18n. No merge or deploy performed.

## Coverage

English, Hindi and Marathi are shared across retail/restaurant shop, product, cart, checkout, favorites, tracking, my orders, reviews, contact fields, install/push prompts, offer popup controls, header and common feedback. Existing short-key translations remain compatible. New source-text entries are presentation only. Shop names, product descriptions, categories, review bodies, custom question labels/choices and provider messages/templates stay as entered.

The locale cache reads storage at route/account changes and storage events, never once per label. Guest preference uses a separate key; the old dd-language preference is read only for guests. Authenticated accounts use their own ID/email key and do not inherit guest choice. Preferences persist on this browser, not across devices. Font scope uses the existing local Noto Sans Devanagari family, including portal overlays. Known server errors are matched exactly; dynamic stock/minimum/coupon amounts use narrow patterns preserving customer names and numbers. Unrecognized errors keep their original text.

## Results

- Production build passes with WhatsApp UI flag enabled.
- Server suite: 244 tests, 241 pass and the same three baseline failures (real Postgres CRM integration and two purge failure-path tests). This matches current main's pass count; no server tests were dropped.
- Client shared tests plus WhatsApp chooser tests: 30 pass, zero fail, including eight storefront tests and ten owner tests.
- 48 page checks: retail and restaurant shop/product/my-orders/tracking x three languages x 390/1280. Zero uncaught errors, failed boundaries or document overflow.
- All-language interaction tests: favorites, retail cart/coupon, restaurant size/add-ons sheet, checkout/confirmation, localized required-field validation, live switching, reload and route persistence.
- All-language state tests: empty catalog/favorites, closed shop, known error page/toast, storage event refresh and guest/account isolation.
- Actual pixel inspection: Hindi mobile cart/checkout/tracking/error/empty favorites, Marathi mobile item sheet/closed shop and Marathi desktop product. Labels are readable and controls fit. Full-page screenshots capture sticky controls at the active scroll position.

## Main follow-ups included

Singular table key and staff-delete confirmation, aria-label, Keep, Yes/delete, Deleting and Staff deleted are localized. Staff deletion remains owner-only and unchanged operationally. AppBoundary remains English by design.

## Limits

No authenticated customer account exists in the storefront today; anonymous buyers use the guest/browser preference. Native file pickers/browser permission prompts are browser-owned. Existing downloadable/printed PDFs and hosted order-message bodies are not wholesale translated. No message, order, payment or notification subscription was sent to production; tests use local mocks. Hindi/Marathi money and consent wording still needs native-speaker review before public release.

## Reproduce

Run `node --test client/src/shared/lib/*.test.js client/src/features/whatsapp/setup-choice.test.js`, `npm test`, and `VITE_WHATSAPP_INTEGRATION_UI_ENABLED=true npm run build`.

For browser checks, install `@playwright/test` without changing the lockfile, start `node scripts/i18n/storefront-mock-server.mjs`, then run `storefront-matrix.mjs`, `storefront-interactions.mjs`, and `storefront-states.mjs` in that directory. CHROME_PATH overrides the system Chrome path. Evidence writes to /tmp; tests make no external changes.
