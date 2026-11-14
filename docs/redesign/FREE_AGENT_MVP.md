# Independent recruitment journeys — 14 November 2026

User scope: players and coaches can maintain an independent recruitment profile,
upload their own short clips/details, opt into discovery, find nearby opportunities,
and accept trials. Club admins and authorised coaches can browse candidates and
post player/coach vacancies. Removal revokes that club's access, not the person's
account. With no other membership, the person uses the independent portal. Account
and data deletion must remain available without club approval. Family flows remain
outside this MVP.

## Work ledger

Latest checkpoint: explicit player/coach recruitment identity, vacancy filters,
role-bound invitation acceptance and club approval are now implemented and covered
by the local HTTP/PostgreSQL suite (10 journey tests, plus 6 registration tests).
Native candidate acceptance reaches the coach API. New uploads receive cleanup
leases, and expired identity markers have a retention worker; historical storage
still needs reconciliation. Native last-club removal and account deletion now
pass, with API checks proving 403 club access and 401 old-session rejection.
The older remaining-items list below records the
earlier checkpoint; see INTEGRATION_PROGRESS.md for current verification limits.

- Existing: player profiles, photos/video upload, privacy controls, postal-region
  filtering, club player searches, trial requests/invites, admin-reviewed joining.
- Implemented locally: removal → independent portal, close stale trial invitations,
  preserve other club memberships. Nine HTTP/PostgreSQL journey tests pass,
  including transactional media-erasure scheduling. Native removal is not yet captured.
- Implemented locally: durable storage deletion queue for referenced individual
  media, profiles and accounts; retry outages, wait out issued upload URLs and
  remove completed job metadata. Migration applied only to isolated local QA DB.
  No real R2 object erasure was exercised in these tests.
- Implemented locally: German/English app + website privacy/deletion information;
  data export now includes recruitment privacy/location preferences. Existing
  30-day deletion commitment retained, with statutory exceptions. This is not
  a blanket compliance certification or a full historical-data purge.
- Implemented locally: discovery off by default in signup/profile editor; the
  legacy onboarding endpoint respects availability rather than forcing PUBLIC.
  Removing the last club pauses any old listing rather than republishing it.
- Implemented locally: account refresh after server socket revocation, on
  foreground and every 30 seconds while active. Stale responses cannot undo
  sign-out. Auth-state regression tests pass; native routing still needs capture.
- Implemented locally: clip + thumbnail ownership and stored-object validation;
  fail closed when storage is unconfigured. Foreign legacy thumbnails are not
  queued for deletion by someone else's account.
- Remaining: explicit player/coach recruitment identity and coach vacancy filters;
  coach onboarding and approval must never grant staff powers from self-selection.
- Remaining: optional nearby opportunity suggestions; distinguish approximate
  postal-region filtering from actual distance. No automatic invitation or acceptance.
- Remaining: audit visibility of media URLs already uploaded to public storage;
  hiding a listing must not be described as revoking copies or existing public URLs.
- Remaining: reconciliation of uncommitted/orphan uploads and historical deletion
  markers/retention; the new queue covers known database references, not every
  previously uploaded or externally copied object.
- Remaining: connected simulator checks for independent profile/media/trial flows,
  including withdrawal, removal, rejoining, deletion and cross-account visibility.
- Carried forward: native player reconfirmation after coach reschedules training.
  Initial native player YES → real coach API count passed; reconfirmation not yet
  verified natively.

## Privacy invariants

- Discovery is an explicit choice. Removal must not create/publish a listing.
- A candidate's recruitment role is not a club permission.
- Exact postal code is owner-only; discovery returns a region.
- No membership in one club implies access to any other club.
- Removal from a club is not account erasure. Individual profile/media removal is
  distinct from full account deletion. Neither requires a paid plan.
- Retain only necessary deletion-job metadata until processing succeeds; remove
  completed jobs. Do not retain indefinite user-linked safety markers.
- Policy copy describes implemented behaviour, not unbuilt coach/AI matching.
- No production DB migration, deploy or paid build is implied by local verification.
