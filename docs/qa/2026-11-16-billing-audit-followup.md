# Billing adversarial audit follow-up — 16 November 2026

Review-only changes in `codex/consolidate-anstoss-20261116`, isolated worktree
`/Users/yemi/anstoss-consolidation-20261116`. Do not promote `develop` or `prod`.
Auth changes remain excluded. Billing remains disabled. No real purchases,
cloud builds, deployments, store submissions, or Renuir changes were made.

## Confirmed findings and fixes

- Live ticker clock, recording and undo require the club's current `liveTicker`
  entitlement. REST/socket permission hints use the same entitlement. Authorized
  members retain readable history after expiry; safeguarding and core team
  features were not recategorized.
- Google out-of-app resubscriptions accept the canonical expired-account
  context or an existing exact-token/environment database mapping. Every
  available identity must agree. Unknown tokens remain unbound; expired tokens
  used for identity do not become replacement tombstones. Resubscribe-only
  account fields are sent on acknowledgement after the database commit.
- Deferred changes accept a bounded, validated two-item replacement. Only the
  effective SKU grants access. The pair is persisted for later marker removal;
  historical replacement metadata cannot reverse a round-trip transition.
  Existing token tombstones continue to prevent old entitlement revival.
- Checkout initiation reserves a club's payer, store and selected SKU under the
  club transaction lock. Two managers or two different SKUs cannot win a race.
  Merely viewing plans does not reserve checkout. The shared prepare request
  now requires an approved `productId`; the mobile caller supplies it.
- Store ownership survives club-role transfer/deletion/demotion. Same-payer,
  same-store, same-SKU retry remains possible when no active/recoverable
  subscription exists. A durable active grant resolves the SKU reservation;
  an expired restore cannot clear it. Recoverable hold/pause/pending states
  block new checkout even when entitlement access has expired.
- Scheduled reconciliation includes revoked Apple chains so a missed refund
  reversal can recover. Superseded token guards still prevent revival.
- Provider tests reject forged Apple JWS and incorrect Google identity,
  audience, issuer, verification status and signature-verification failures.

Google's authenticated resource supplies the resubscribe identity and historical
replacement fields; these are not accepted from client-selected account data.
See the [resource definition](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)
and [acknowledgement request](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/acknowledge).
The effective-period logic follows Google's
[deferred replacement lifecycle](https://developer.android.com/google/play/billing/subscriptions#deferred).

## Recovery policy and remaining limits

There is deliberately no automatic reservation timeout or takeover. A delayed
store payment can complete after an arbitrary timeout. The app explains that
the original payer should retry or restore the same purchase/store, or contact
Anstoss support. Billing ownership is not club administrative ownership.

If the original payer is unavailable, deleted or demoted, or a checkout was
abandoned before a token was returned, recovery requires operator review.
There is no automatic transfer/release endpoint in this candidate. Do not
delete an ownership row merely because a client reports cancellation or time
has elapsed. Inspect known canonical store subscriptions, original payer/store
identity, pending purchases and the audit history. If an outstanding charge
cannot be ruled out, keep new checkout blocked. Legacy payer tokens without a
known checkout owner also fail closed pending that review.

This reservation does **not** guarantee prevention of every duplicate store
charge: one Anstoss payer can use multiple Apple/Google store accounts, and
stores can initiate out-of-app purchases. Same-SKU retries and account-switch
recovery require real sandbox tests before enabling billing. Do not advertise
absolute duplicate-charge prevention or complete automated recovery.

## Verification

PostgreSQL tests use two dedicated databases on `127.0.0.1:55484`. Real SQL,
transactions, tenant classification, entitlement resolution and worker logic
are exercised; external store operations are simulated. Coverage includes
cross-payer/store/SKU races, role transfer, deleted payer, no timeout takeover,
late callbacks, expired restores, hold recovery, refund reversal, replacement
marker removal, grant idempotency and predecessor replay.

Independent read-only adversarial rechecks identified the historical-replacement
and hold-state issues during this follow-up; both were fixed and regression
tested. The final focused recheck reported no remaining concrete blocker.
Full-suite results are recorded in the [consolidation report](2026-11-16-consolidation.md).
Real sandbox purchases, notification delivery and final native binaries remain
unverified for this billing-only runtime.
