# Senior QA suite

`npm ci && npx playwright install chromium`

Run safe live smoke: `npx playwright test -c tests/playwright.config.mjs`
Run existing client unit tests: `node --test $(find client/src -name '*.test.js')`
Run existing server tests: `npm test` (CRM integration requires its local Postgres fixture).

The smoke suite is read-only on the three dedicated QA storefronts. It never submits checkout, sends messages, creates subscriptions, or writes store settings. Single worker prevents rate bursts. It checks 390/1280px, English/Hindi/Marathi persistence, 44px language selectors, document overflow, theme controls, product details, public access routes and browser exceptions. Screenshots/traces/HTML results are under tests/artifacts. Visual screenshots require human review; capture alone is not a visual pass.

Optional owner regression will use a locally prepared QA-owner storage-state file (never commit it), assert store 12 before any write, and keep notifications off. Do not reuse production-owner/customer identities. Store 14 must never be a write target. Phone push arrival, paid providers, actual WhatsApp delivery, and destructive store lifecycle need separate controlled fixtures/authority. These are not covered by a passing read-only smoke run.

No suite merges itself. Review this branch before enabling any live mutation tests. No CI schedule is enabled; run on demand after a deployment is confirmed ready.
