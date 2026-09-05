# The Last Ad

A full-stack, single-billboard advertising experiment. React + TypeScript + Vite, Express on Node 24, PostgreSQL or SQLite, hosted Stripe Checkout, and optional Resend service emails.

## Implemented

- Live shared countdown with server-authoritative audience actions, signed browser identity, SSE refresh, polling fallback, and atomic queue advancement.
- One audience action per browser identity per placement; stale requests never affect a successor.
- 500-action placements, 24-hour expiry, one 250-action refill, and no consecutive placements from the same sponsor.
- Clearly labeled house and complimentary ads. No fabricated activity or sponsor metrics.
- Sponsor registration, password hashing, seven-day sessions, dashboard, creative preview, image upload, review submission, and resubmission.
- Moderation and queue controls at `/admin`, protected by an operator-configured token. No default administrator account or password.
- Private view/action/outbound-click reporting; public graveyard, result pages, and downloadable SVG certificates.
- Stripe checkout after approval, signature-verified webhooks, idempotent fulfillment, reconciliation, and late-refill refunds.
- Optional email outbox for approval/live/ended messages and password recovery.
- Content, privacy, and placement terms; public operator details are supplied through environment configuration.

## Local development

Requires Node 24 or later.

```sh
npm ci
npm run build
node server/index.js
```

The server listens on `0.0.0.0:3000` or `PORT`. For frontend hot reload, run `npm run dev` separately; Vite proxies API requests to port 3000.

No third-party credentials are needed for the house billboard or local account and moderation testing. Without an `ADMIN_TOKEN`, the operator desk remains locked. Generate your own high-entropy token and keep it outside source control.

## Deploy Hatch

Project: **the last ad**. Repository: **EnRICHedCreations/thelastad**, branch **main**.

| Setting | Value |
| --- | --- |
| Runtime | Node.js 24 |
| Service | Web |
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm start` |
| Health | `GET /api/health` |

`npm start` explicitly selects production mode and secure cookies. TLS terminates at the hosting ingress. Run one application process initially. SSE is optional for correctness; HTTP polling restores state when streaming is unavailable.

### Production configuration

Copy variable names from `.env.example`; **do not commit actual values**. Deploy Hatch's connected configuration API does not accept secret/environment fields, so the owner must supply them in the project's environment settings.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_URL` | Exact public HTTPS origin, without a trailing slash |
| `DATABASE_URL` | Recommended durable PostgreSQL connection string |
| `DATA_DIR` | Alternative: an explicitly mounted persistent directory for SQLite |
| `ADMIN_TOKEN` | High-entropy secret for the operator desk |
| `STRIPE_SECRET_KEY` | Stripe server credential |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this application's Stripe webhook |
| `OPERATOR_NAME` | Public legal operator name |
| `OPERATOR_ADDRESS` | Public business address |
| `SUPPORT_EMAIL` | Public support contact |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional email delivery and password recovery |
| `TRUST_PROXY` | Optional known number of trusted ingress hops; do not guess |

Without `DATABASE_URL`, the application uses SQLite in `DATA_DIR` or `./data`. **Local disk durability across Deploy Hatch replacement/redeployment is not established.** Configure a managed database or a verified persistent mount before collecting production sponsor data. Images are stored in the database, so their durability follows the same storage choice. Changing storage backends starts a separate database; migrate existing records explicitly first.

Payments remain disabled until Stripe credentials, HTTPS origin, explicit storage configuration, administrator token, and operator identity/contact are all present. An explicit `DATA_DIR` is an operator assertion that its mount is persistent; the application cannot verify hosting mount durability.

At `/admin`, use the configured token to review a submission. Choose **Approve** to permit paid checkout or **Complimentary** for a disclosed free pilot placement. **End** stops a placement without automatically refunding it. **Remove** additionally redacts its public creative and queues refunds for fulfilled payments.

### Stripe activation

Confirm this advertising product is supported for your Stripe account and jurisdiction. Start with test credentials.

1. Set the required runtime values above.
2. Register `https://YOUR_PUBLIC_ORIGIN/api/webhooks/stripe` in Stripe.
3. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. Supply the endpoint's signing secret as `STRIPE_WEBHOOK_SECRET` and redeploy.
5. Exercise a test purchase after moderation, a refill, and a refund. Never treat the browser return URL as proof of payment.
6. Review the published operator details and terms before switching to live credentials.

Checkout creates USD prices server-side. Each transaction has a stable idempotency key. Fulfillment verifies paid status, amount, currency, and session identity. A background task reconciles checkout sessions and retries pending refunds every 30 seconds. Failures remain visible as payment states in the operator desk. Real provider transactions have not been tested without account credentials.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Verification

```sh
npm test
npm run build
npm audit --omit=dev
```

Tests use isolated temporary SQLite databases. They cover duplicate and concurrent audience actions, exactly-once handoff, time expiry, consecutive-sponsor prevention, duplicate payment fulfillment, late refunds, unpaid/mismatched payments, account isolation, CSRF rejection, moderation, tracking, archive/certificate generation, and the disabled payment gate. Test transactions are local fixtures and do not contact Stripe.

PostgreSQL support is implemented through the shared parameterized query/transaction adapter; a live PostgreSQL integration test requires `DATABASE_URL`. Production payment, email, and persistent-volume behavior require the owner's external configuration. Browser-based visual testing has not been performed.

## Operational notes

- Back up the database, including image assets and the cookie-signing secret in `settings`.
- `/api/health` checks database connectivity and reports enabled integrations without returning secrets.
- Audience event records expire after 90 days; aggregate metrics and archive records remain.
- Browser identity is not verified human identity. IP rate limiting, signed cookies, deduplication, and basic bot filtering limit simple abuse; a public adversarial campaign will require stronger bot challenges and monitoring.
- Password recovery is unavailable until email is configured. No emails are sent in an unconfigured deployment.
- No analytics vendors, external image hotlinks, default secrets, or sample paying customers are included.
