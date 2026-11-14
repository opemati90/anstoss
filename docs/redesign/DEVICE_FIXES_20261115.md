# Device feedback release — 15 November 2026

Scope: the physical-device onboarding, chat, permissions, notification refresh,
keyboard and admin billing complaints. Builds on the existing four-role MVP;
does not re-import the design branch or reset production data.

## Root causes and changes

- **Chat connection/history:** asynchronous gateway connection authentication
  did not delay Socket.IO's first client requests. Namespace middleware now
  authenticates before connect. Nest's adapter interpreted `{ event, data }`
  responses as unsolicited events, while mobile awaited acknowledgements. A
  gateway interceptor now acknowledges callback-based requests and preserves
  legacy event-only clients. Real Nest transport tests cover this distinction.
- **Team replies not saved:** WebSocket sends bypassed the HTTP tenant-context
  interceptor. The database correctly rejected Message.create. The write now
  executes and awaits Prisma's lazy query inside a context derived from the
  authorized channel, never the client-supplied club ID. A lazy-thenable regression
  checks both scope and cleanup. Direct messages were not affected by this write.
- **Reconnect after access changes:** server-initiated disconnects do not retry
  automatically in Socket.IO. Active screens reauthenticate and refresh access;
  foregrounding reloads history. History sender relations are normalized so
  names do not become Unknown.
- **Requests need manual refresh:** pending users can register push tokens;
  received notifications invalidate visible queues and access. Focused queues
  refresh on foreground and every 15 seconds as a fallback when push is denied.
- **Join again / low pending screen:** removed a duplicate Linking handler that
  stacked invitations on top of Expo Router's own route; onboarding and invite
  routes use full-page card presentation. Active or pending matching membership
  leaves the invite route without submitting again.
- **Dates and keyboard:** DOB is always day/month/year, visibly DD.MM.YYYY,
  including English. Required onboarding fields have an asterisk. Shared
  onboarding uses keyboard-aware scrolling and a keyboard-sticky action footer.
- **Club onboarding:** no DFB identifier field. New unclaimed clubs activate
  immediately, without players, external links or a review wait. Duplicate
  identity and competing-owner checks remain; flagged claims still require
  support. Audit records explicitly identify self-registration, not DFB
  verification. A failed profile refresh retries refresh, not club creation.
- **Permissions:** Preview/stand-in is disabled in navigation and the client
  state layer. Only active head/assistant coaches can create/share chat lineups;
  both channel and DM APIs enforce this independently of the menu.
- **Admin billing:** monthly and annual definitions use the shared app/website
  catalogue: EUR 10.99 monthly or EUR 109.90 annually (EUR 21.98 annual saving),
  five teams and 150 player seats. Existing grants retain their definitions.
  Historical six-month records remain visible but cannot be newly published.
  Linked Stripe prices must match currency, amount and recurrence. Monetary
  displays retain cents. Club-dialog scrolling verified at desktop and mobile
  widths in a real browser.

## Verification boundaries

- Native checks use Maestro on the signed iOS simulator with the real local
  Nest API, PostgreSQL, OTP, authorization and sockets. Signed-out QA deep links
  select the language/reset the test session, not response fixtures.
- Chat acceptance requires the coach's real socket history and DM REST history
  to contain the player's native replies. An optimistic bubble alone is not a
  passing result.
- External APNs/Expo delivery to a locked physical iPhone cannot be proved by
  this isolated simulator. Token registration and refresh paths are covered,
  but a two-device TestFlight notification check remains a release acceptance
  step. No production push blast or database reset is part of these tests.
- No new Stripe charges/products, funded prize campaign, DFB scraping/feed,
  family journey or simulated live match data is enabled by this release.

## Local results

- API: 147 suites / 1,467 tests passed; 30 explicitly skipped tests. Final
  lazy-query regression rerun passes all 22 gateway inbox cases.
- Mobile: 144 suites / 1,094 tests passed; one pre-existing skip. The four
  reported open handles came from unmounted tab-role test trees. Those trees
  now unmount, and the complete suite exits normally without forceExit.
- Shared: 166 tests passed. Admin and website smoke tests pass. All-workspace
  lint/typecheck/build and store-readiness audit pass.
- Actual native request submission and automatic post-approval transition pass.
  Cold reopening retains membership. Real native team and DM replies are present
  in the coach's subsequent server history. Player lineup menus are absent and
  the REST lineup endpoint denies the player.
- English DOB keyboard entry passes with the Next action focusing the day field.
  The new-club native flow reaches home without a DFB code or roster; PostgreSQL
  contains the approved self-registration, not a pending verification claim.
- Browser admin dialog scrolls down and back up at desktop and 390px mobile
  widths; monthly/yearly prices, cents and annual saving were inspected.

Superseded failed QA attempts were not accepted: optimistic chat bubbles did not
prove persistence; editing code during Metro-driven capture caused a development
reload and invalidated one registration capture. The connected reruns above are
the acceptance evidence.
