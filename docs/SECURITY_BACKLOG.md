# Security backlog (parked, from audit at 1a7a84f)
Done: H2 order/request limits, H3 push endpoint allow-list, H4 headers (CSP report-only), M1 login hardening, M2 HS256 pinning, limiter IP keying.
Parked: M2 secret separation (NOTIFY_ENC_KEY, INVOICE_LINK_SECRET, TRACKING_SECRET), M3 token version + logout all, M4 DNS-rebinding fix in notify.js, M5 BYO webhook verification, M6 phoneNumberId/accountSid validation, M8 report/CSV memory caps, M9 Vyapar import bounds, M10 commission excludes cancelled, M11 staff reset/forced change, M12 coupon limits, L1-L7, CSP enforce (hash the inline boot script), CI guards (eslint no-undef, gitleaks, npm audit, permissions route test).
M7 (store creation cap) ships with the Clients feature (per-client store limit).
