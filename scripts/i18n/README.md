# Owner language checks

The owner dashboard supports English, Hindi and Marathi. The preference is per authenticated user in local storage on the current browser. It is separate from the storefront language. Customer-entered names, products, messages, provider template bodies and API enum values are not translated.

Noto Sans Devanagari is served locally with its SIL Open Font License. Owner dictionaries are registered when the dashboard chunk loads. Unrecognized server/provider messages fall back to their original text, rather than guessing at their meaning. Browser-controlled file chooser/date controls use the browser locale.

## Unit and source coverage

```
node --test client/src/shared/lib/owner-i18n.test.js
npm test
VITE_WHATSAPP_INTEGRATION_UI_ENABLED=true npm run build
```

The baseline server suite has 233 passing tests and three failures: the real Postgres CRM integration, and two store-purge tests. These are unchanged by this client-only branch.

## Local visual and interaction checks

Install Playwright in the test environment without changing application dependencies:

```
npm install --no-save --package-lock=false @playwright/test
node scripts/i18n/mock-server.mjs
```

With that server running, in another terminal:

```
node scripts/i18n/viewport-matrix.mjs en 390
node scripts/i18n/viewport-matrix.mjs en 1280
node scripts/i18n/viewport-matrix.mjs hi 390
node scripts/i18n/viewport-matrix.mjs hi 1280
node scripts/i18n/viewport-matrix.mjs mr 390
node scripts/i18n/viewport-matrix.mjs mr 1280
node scripts/i18n/settings-matrix.mjs
node scripts/i18n/interactions.mjs
node scripts/i18n/table-panel.mjs
```

Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome. The harness only uses local mock data and never sends messages, payments or production changes. It checks every owner page in all three languages at both widths, plus the four Settings sections, language switching, reload persistence, user isolation, required-field validation, and mobile navigation. Screenshots and JSON summaries are written under /tmp.

No production deployment or merge is included. Review translation wording and the UI before release. This branch does not add server-side or cross-device language storage.
