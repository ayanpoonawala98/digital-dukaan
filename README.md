# Digital Dukaan

WhatsApp-first catalogs for small businesses. Superadmins create each owner account and its initial store; each store has its own categories, products/services, WhatsApp number and shareable storefront. Customers browse, search, add to cart and tap **Order on WhatsApp** to open a chat with the store's number. Each order records a lead the owner can track and update on WhatsApp.

## Live deployment (free tier)

- Storefront: https://digitaldukaan.space (demo store: https://apna-kirana-store.digitaldukaan.space/)
- API: https://api.digitaldukaan.space (serverless Express on Vercel)
- Database: Neon Postgres (free), media: ImageKit (free)

## Stack and layout

React 18 + Vite in `client/`; Node.js + Express + Sequelize in `server/`; PostgreSQL (Neon in production, any Postgres locally). JavaScript ES modules, npm workspaces. Images upload to ImageKit when `IMAGEKIT_PRIVATE_KEY` is set, local `server/uploads/` otherwise.

## Local setup

Requires Node 20+, npm and a Postgres database.

```bash
cp .env.example .env
# Edit .env: DATABASE_URL, random 64-char JWT secret, seed credentials
npm install
npm run seed
npm run dev
```

Visit http://localhost:5173. Demo storefront: http://localhost:5173/store/apna-kirana-store. API: http://localhost:4000. Log in with the owner or superadmin credentials from `.env`. The seed is repeatable and does not overwrite existing records.

`npm run build` builds the frontend; `npm test` runs backend unit tests.

## Features

- Storefront `/store/:slug`: hero cover, offers banner strip, business-hours open/closed badge, product search + category filters, services alongside products (Book on WhatsApp), dark mode, animations.
- Cart with delivery charges, free-delivery threshold and minimum order; checkout returns an encoded `wa.me` cart message. Single-product Buy and service booking also go through WhatsApp.
- Store QR code (SVG) for sharing, wishlist/favorites, repeat order from order history, web push notifications for restock/offer broadcasts by the owner.
- Owner dashboard: store settings (banner, hours, delivery, min order, UPI, GSTIN, logo/cover, accent color), category and product/service CRUD with ImageKit photo uploads, low-stock alerts, lead/enquiry list with status updates that generate a WhatsApp link to the customer, non-tax estimate PDF per enquiry, web push broadcast.
- Vyapar integration: CSV export ("Export to Vyapar") of sales and CSV import ("Import from Vyapar") of items/sales preserving original invoice dates.
- Superadmin dashboard: all users, all stores, platform counts, activate/pause users and stores. The seed creates the initial superadmin; only that role can create owner logins and their stores. Public registration is disabled. Existing owners may add stores to their own account. The Start your shop CTA submits a shop request visible to the superadmin.

## Current release notes

- A retail shop logs WhatsApp enquiries, not verified payments. Sales totals count only restaurant orders marked served, and payment still needs checking off-platform.
- Restaurant mode uses numbered-table dine-in plus takeaway and delivery forms. Orders appear in the owner dashboard. Restaurant orders are visible in-app; there is no automatic WhatsApp alert.
- Coupons apply a shop-created percentage code to cart enquiries and restaurant orders. The retail storefront estimate does not show a verified discounted total until the WhatsApp draft is prepared.
- Referrals: the owner creates a link for the referrer's phone. On a referred, confirmed order with the distinct customer's matching phone, the owner manually records a 10% reward entitlement for each side. The dashboard does not automatically discount a later order or send money. Verify each customer and apply the discount manually before marking one-time use. Dine-in referrals require a customer phone tied to the order and are not yet supported by the anonymous table-order flow.
- Limited staff accounts can see their assigned store and restaurant orders, and update restaurant order status only. Do not reuse an owner password. If a staff member loses their password, disable their account and create a fresh one with a securely shared temporary password.
- Hindi and Marathi controls translate a subset of storefront labels and checkout fields; product names and owner-provided text remain as written. WhatsApp broadcasts require numbers entered by the owner from opted-in customers, and open drafts one at a time; no sends happen in-app. Offer popups are off by default and can be configured per store.

## Deployment notes

Backend deploys to Vercel as a serverless function (`server/api/index.js` + `server/vercel.json`); frontend deploys as a static Vite build with SPA rewrites (`client/vercel.json`). Required backend env vars: `DATABASE_URL` (pooled Neon URI), `JWT_SECRET`, `CLIENT_URL`, `PUBLIC_API_URL`, `IMAGEKIT_PRIVATE_KEY`, `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT`. Frontend build needs `VITE_API_URL`. Run `npm run seed -w server` once against the production database to create the superadmin, demo owner and demo store.

## Custom domain and shop subdomains

The app runs at `https://digitaldukaan.space`, the API at `https://api.digitaldukaan.space`, and a store with slug `my-shop` at `https://my-shop.digitaldukaan.space`. Existing `/store/my-shop` links remain valid. Custom domain limits depend on the account and plan, so the store creation endpoint fails safely rather than claiming a link when the cap is reached.

Hostinger DNS zone: A `@` -> `216.198.79.1`, CNAME `api` -> `bc6edcbe890ef85c.vercel-dns-017.com`, CNAME `*` -> `bb262c412972c4b2.vercel-dns-017.com`. Keep mail TXT/DKIM records intact. Each new store is explicitly registered with the frontend Vercel project by the API using a project-scoped `VERCEL_STORE_DOMAIN_TOKEN`. Its current vault entry expires 2027-09-29 and must be renewed before then. The wildcard DNS record alone does not attach an arbitrary hostname to the Vercel project. `STORE_SUBDOMAINS_READY=true` enables subdomain QR/WhatsApp links; `VITE_STORE_SUBDOMAINS_READY=true` enables subdomain sharing links. `VITE_API_URL=https://api.digitaldukaan.space`. Never put secrets in this source archive.

The former Cloudinary assets are retained externally for rollback; new uploads and all current nonempty image URL fields use ImageKit.

## Recoverable store removal (pending deployment)

Owner or superadmin can remove a store after entering its exact slug. Removal takes
its public catalog and order endpoints offline, hides it from normal dashboards,
and retains its data for up to 30 days. Within that window, the owner or
superadmin can restore it. A store that was paused before removal stays paused
on restore. Staff cannot remove or restore a store.

A daily Vercel cron checks for expired stores. **Before deploying this feature,
configure `CRON_SECRET` as a production environment variable on the API project**
(at least 32 random characters) and confirm the daily cron appears in Vercel.
The purge endpoint rejects requests without the bearer secret. The purge removes
up to 25 expired stores per run: it detaches that store's Vercel subdomain, then deletes
its related staff, orders, leads, products, categories, coupons, referrals and
subscriptions in a database transaction. It leaves owner accounts, unrelated
stores and ImageKit media untouched. If domain detachment or DB deletion fails,
the tombstone remains for a later retry; alerting and reconciliation are needed
for repeated failures or a larger backlog. Scheduled runs are daily, not guaranteed at the exact
30-day minute. Never call the retention promise active before the cron, secret,
and one end-to-end isolated deletion/restore test have been checked.

### Isolated CRM and WhatsApp Cloud API groundwork (not enabled on production)

- `CRM_ENABLED=true` creates only `customers` and `customer_import_batches` in the configured database and opens owner-scoped `/api/owner/:storeId/customers`. Set `VITE_CRM_ENABLED=true` in the **client** build too to expose the Customers tab. Both flags default off. Set only together after a staging test and production schema backup; no existing table is changed for CRM.
- Contacts are keyed by store and normalized international phone; CSV/XLSX (up to 500 rows and 2 MB) imports require a preview digest and skip existing contacts. Import never infers consent. Undo removes only rows made by that batch that have not since been edited. The owner must enter purpose, source and timestamp to record opt-in; opt-out cannot be reversed in the edit form. This is a contact ledger, not permission for automated messages.
- `/api/integrations/whatsapp/webhook` is inert unless `WHATSAPP_CLOUD_ENABLED=true`. Set `WHATSAPP_VERIFY_TOKEN` (chosen secret) and `META_APP_SECRET` (Meta app secret) server-side before verifying the callback. POST validates `X-Hub-Signature-256` against the raw body; it acknowledges valid events but does not persist or act on them. There is no live inbound inbox yet.
- `sendTestWhatsApp` is an unexposed server-side client. It cannot send unless `WHATSAPP_CLOUD_ENABLED=true`, `WHATSAPP_TEST_SEND_ENABLED=true`, `WHATSAPP_ACCESS_TOKEN` and the exact `WHATSAPP_TEST_RECIPIENT` are set. The temporary token must be provided as a server-only secret, never committed, exposed to the browser, or logged. It expires and is replaceable with a permanent System User token later. No endpoint calls this client yet. Configure and test the webhook, event persistence/idempotency and consent before enabling a production messaging route.
- Do not deploy or set flags solely because a local build passes. Run `npm test`, `npm run build`, stage with real database migration and verify existing storefront, cart-to-WhatsApp draft, owner dashboard, products, settings, restaurant orders and auth before and after any rollout.
