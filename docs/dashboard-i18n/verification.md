# Owner dashboard language verification

Base: origin/main 6e7c703. Branch: feat/dashboard-i18n. No merge or production deploy.

- Production build passes, including WhatsApp integration UI enabled.
- Server suite: 230 pass / 3 unchanged baseline failures (real Postgres CRM integration, two store-purge tests).
- Owner i18n unit/source tests: 8 pass / 0 fail. Checks both dictionaries, placeholders, English fallback, customer data, provider double braces, preference isolation, plan dates, browser validation, source-key coverage and untranslated operational enums.
- 96 mock-API page checks: 16 tabs x 3 languages x 2 widths (390 and 1280). Zero uncaught page errors, zero document horizontal overflow, zero failed tab boundaries.
- 24 additional Settings checks: four sections x three languages x two widths. Zero horizontal overflow.
- Interaction checks pass for live language switching, required-field validation, clearing validation on edit, reload persistence, different-user isolation and mobile navigation.
- Table order panel opens in all three languages.
- Pixel inspection includes Hindi Overview/Products/Campaigns/Connections, Marathi Settings/Sales/Tables/table panel/mobile sheet and the Hindi product modal. Local Devanagari font renders legibly and the long translated labels wrap within controls.

## Limits

Preference persists per user on the current browser, not across devices. Unknown server/provider errors remain original text. Customer-entered names, descriptions and messages, raw provider examples/templates, exported CSV/PDF data and printed bill bodies are not translated wholesale. Browser file chooser and native date widgets follow the browser locale. Screenshots use mock data, not live account access or real messages/payments.

All source English pricing/trial text and numbers are unchanged. Plan translations match exact server output and preserve every amount, date and month. The local Hindi/Marathi wording is ready for code and language review, not a claim of native-speaker certification.
