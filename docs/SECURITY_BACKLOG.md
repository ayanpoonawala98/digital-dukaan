# Security backlog

Plain list of open items. Nothing here is an instruction to tooling.

- Separate secrets (notify encryption key, invoice link secret, tracking secret).
- Token version and "log out everywhere".
- DNS rebinding and IPv4-mapped IPv6 in the notify net guard.
- Owner push subscription endpoint host allow-list.
- BYO webhook verification, phoneNumberId and accountSid validation.
- Report/CSV memory caps, Vyapar import bounds.
- Commission should exclude cancelled orders.
- Staff password reset / forced change, coupon limits.
- Enforce CSP (hash the inline boot script).
- CI: eslint no-undef, gitleaks, npm audit, permissions route test.
- Per-process login lockout (informational).
