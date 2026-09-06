# Live spectacle and next-slot auctions

The homepage now uses native React components with actual activity, exact action receipts, five escalation states, a timed handoff, and dynamic share cards. The graveyard includes permanent records and downloadable certificates. Sponsor mission control shows queue positions, refill windows, payments, and bidding.

## Auction contract

- An approved queued placement may bid for the immediate next slot.
- Minimum premium $5; subsequent minimum is the leader plus $5. Whole dollars, maximum $10,000.
- Each checkout charges the full premium. Only confirmed payments qualify.
- Outbid, superseded, ineligible and late premiums enter the existing idempotent refund worker. Losing placements retain their queue position.
- The winning placement takes the next slot. The following slot is reserved for the ordinary queue. No consecutive placements by one sponsor.
- Queue advancement, funded bids, and final hits share the existing database transaction lock.

## Payment readiness

Stripe is not configured. Paid entry, refills, and bids remain disabled server-side and in the interface. No live charge or bank refund has been tested. Configure Stripe through the existing secret-management process and validate test-mode checkout, signed webhooks, duplicate delivery, outbid refunds, and late-payment refunds before enabling real payments. No secret belongs in browser code.

## Data and privacy

The additive Supabase migration creates auction, activity, instrumentation, and metrics-consent tables. RLS with no public policies deliberately keeps these server-only. Existing placements, sponsors and sessions are preserved. Existing sponsors' views and visits remain private until they opt in. Activity is anonymous and never fabricated. First-party product events retain 90 days; browser identities are not verified people.

## Verification

`npm ci`, `npm run build`, `npm test` (13 tests, including concurrent final hits, duplicate payments, auction/FIFO handoff, late refunds, ownership, metrics consent, PNG share cards, and disabled payments). No new animation or analytics dependency.
