# Anstoss Store Submission Checklist

Last updated: 2026-11-16

This checklist exists to keep App Store Connect, Play Console, the binary, and
the legal copy aligned. Run `npm run audit:store` before every store submission.
Use the current [store privacy and reviewer-access worksheet](store-privacy-answers-2026-09-24.md)
for draft console answers; it is not approval to publish them.

This review candidate includes native store billing behind a disabled server
feature flag. Unfinished social-login/session-security changes are deliberately
excluded and remain in the separate auth session. Source integration is not
approval to enable features, build a distribution binary, deploy, or submit.
See the [billing verification](../qa/2026-11-16-billing-credentials.md).

## Review Access

- Apple App Review notes must provide a real, least-privilege reviewer account
  with synthetic club data. The local E2E mode is not a production reviewer login.
- Google Play Console > App content > App access must provide one of the
  allowlisted `@demo.anstoss.app` review emails and the fixed code in its
  private reviewer field. Request a code in-app first; no email is sent for
  these demo addresses. Never put the code in Git or public listing text.
- Backend services must be live for the submitted build. `/health` must return
  healthy status before submission.
- The `FC Musterstadt — Store Review` fixture is preloaded in production;
  verify it and the review login on a clean install before submission.

## Public URLs

- Privacy policy: `https://anstoss.io/legal.html#datenschutz`
- Terms: `https://anstoss.io/legal.html#nutzungsbedingungen`
- Support/contact: `mailto:kontakt@anstoss.io`
- Account deletion URL for Google Play: `https://anstoss.io/account-deletion`

## Apple App Review Risk Map

- 1.2 User-generated content:
  - In-app report and block actions exist on chat messages.
  - API stores reports, prevents duplicate reports, and routes reported content
    to moderation review. A single report does not automatically hide content.
  - Published contact info exists in Legal/Impressum.
- 2.1 App completeness:
  - No beta/test copy in store metadata.
  - Reviewer account or demo mode available.
  - Backend live during review.
- 2.3 Accurate metadata:
  - Screenshots must show actual club/team flows, not unavailable future
    integrations.
  - Describe FUSSBALL.DE accurately as an optional official third-party widget
    embedded by a club administrator. Do not claim an Anstoss fixture import,
    data partnership, or independent synchronization service.
  - Privacy disclosures identify FUSSBALL.DE/DFBnet and the web-request metadata
    transferred when a user opens an embedded widget. Confirm the club is
    authorized to publish the selected widget under FUSSBALL.DE's widget terms.
- 3.1 Payments:
  - Player/member contributions are tracked as real-world club dues paid to the
    club bank account and reconciled manually by club admins.
  - Stripe is reserved only for Anstoss software subscriptions in a future or
    admin-web acquisition lifecycle. This mobile submission must not present
    external purchase links for digital upgrades.
  - Native digital subscriptions are implemented using Apple StoreKit IAP and
    Google Play Billing. They remain disabled until real store lifecycle tests
    and catalogue gates pass. Match reviewer notes to the actual submitted build.
  - Anstoss does not implement Apple Pay. StoreKit subscriptions and bank-transfer
    club dues are separate from Apple Pay. Inspect the final archived binary for
    transitive PassKit linkage before claiming that framework is absent.
- 4.5.4 Push notifications:
  - Push is optional and not required to use the app.
  - No marketing pushes unless the user explicitly opts in.
- 4.8 Login services:
  - Email one-time-code sign-in remains available. Social login is being handled
    in a separate review candidate. When that work is combined, verify Google
    and native Apple login in the exact iOS binary and describe the visible
    entry points in review notes. Do not copy stale email-only claims afterward.
- 5.1 Privacy:
  - Privacy policy is available inside the app and on the website.
  - Account deletion exists inside the app and through the public deletion page.
  - Purpose strings describe the actual photo, camera, and microphone features.
  - The iOS privacy manifest declares app-collected data and no tracking.
  - User-initiated camera/microphone actions request native permission directly.
    Do not add a cancelable custom pre-permission alert. Settings recovery after
    the user has denied native permission is a separate flow.
  - Device GPS access is not implemented; typed places, addresses and pickup
    points are not device-location permission requests.

## Google Play Risk Map

- User Generated Content:
  - Terms prohibit abusive, harassing, discriminatory, and unlawful content.
  - Users can report content and block users in app.
  - Admin moderation endpoints exist for report review.
- User Data / Data safety:
  - Data Safety answers must match the privacy policy and iOS manifest.
  - Declare collection of account identity, user IDs, club/team data, chat/DM
    content, images, voice notes, contribution/payment records, push tokens,
    crash/performance data, and product interaction diagnostics.
  - Declare no sale of personal or sensitive data and no tracking/ads.
- Account deletion:
  - In-app path: `More -> Data -> Delete account`.
  - Outside app URL: `https://anstoss.io/account-deletion`.
  - Retention exceptions: legal/tax/payment/security records only where required.
- Permissions:
  - Microphone is used only for user-initiated voice notes.
  - Photo library/camera are used only for user-selected profile, club, sponsor,
    and chat images.
  - `SYSTEM_ALERT_WINDOW` must not appear in the release manifest.
  - `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` must not appear unless the app
    has a Google Play-approved core media-library use case; user-initiated
    uploads should stay on the system picker path.
  - `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` must not appear in the
    release manifest; Android uploads should use the system picker grants.
- Payments:
  - Player/member contributions are paid to the club bank account and reconciled
    manually by club admins.
  - Stripe is used only for Anstoss software subscriptions outside the mobile
    purchase flow.
  - Do not add in-app purchase links for digital features without store billing.
- Target audience/content rating:
- Declare the actual target age groups. The DOB gate, under-16 guardian path and
  youth teams mean an adult-only answer cannot be assumed. Any child audience
  requires the relevant Families compliance pass before submission.
  - Content rating questionnaire must disclose UGC/chat and account creation.

## App Privacy Labels

Use App Store Connect privacy labels and Google Play Data Safety answers that
match these non-tracking categories:

- Contact info: name, email address.
- Identifiers: user ID; device/push token where applicable.
- User content: chat/direct messages, other free-form content, photos/images,
  voice notes.
- Purchases/financial: contribution status, receipts, club dues records, and
  Stripe subscription references for the club's Anstoss software plan.
- Usage/diagnostics: product interaction, crash data, performance data.
- Other data: date of birth, role, membership, team access, RSVP and lineup data.
- Health information: player-selected `sick`/`injured` RSVP reasons and optional
  notes remain enabled even though the separate Medic and compliance modules are
  disabled. Declare this in both stores and resolve the Article 9 basis before
  publishing a minor-facing release.
- User-entered city/postal-code and carpool pickup text may map to location or
  address categories; confirm the exact console classification for the binary.

Do not claim collection of the following without evidence; also do not answer
their broader store questions “No” merely because a device permission is absent:

- Behavioral ad tracking. Club-controlled sponsor placements and clickable links
  still require a separate Ads/Families classification review.
- Device GPS location (none found in the current app); user-entered locations
  are a separate classification question.
- Device phonebook access (none found); team/DM relationships may still count as
  contacts or social-graph data.
- Health/Fitness device APIs (none found); RSVP health information is collected.
- SMS/call log access.

## Release Notes Template

Reviewer notes:

```text
Anstoss is a club/team operations app for amateur football clubs.

Login uses Anstoss-owned email one-time codes. Use the credentials supplied in
the private App Review / App access fields. Before copying these notes, state
whether Google and Sign in with Apple are present and enabled in the exact
submitted build; unfinished auth changes are excluded from this review branch.

User-generated chat content includes in-app report and block actions. Reports
are sent for administrator moderation; one report does not automatically hide
content.

Player/member contributions are paid to the club bank account and reconciled
manually by club admins. Anstoss does not offer Apple Pay. Digital subscription
implementation uses Apple StoreKit in-app purchases, not Apple Pay. Before
copying these notes, state whether subscriptions are enabled in this binary and
provide the tested manager-account path to More -> Plan if enabled. Billing is
currently disabled pending store tests; do not submit this unresolved draft.

Age assurance is visible during new-account onboarding after email verification,
on the Name and Date of Birth screen. Underage applicants are blocked or enter
the guardian/consent path. Verify the final age thresholds after the separate
auth changes are reviewed and combined. Existing
seeded reviewer accounts have already completed onboarding, so provide a fresh
test-account walkthrough or recording for this screen. This is date-of-birth
self-declaration, not identity-document verification.

Account deletion is available in-app at More -> Data -> Delete account and on
the web at https://anstoss.io/account-deletion.
```

## Blockers Before Submit

- Verify App Store Connect age-rating answers against the exact binary. Do not
  claim parental content/usage controls merely because parents manage child
  profiles, and do not erase the real DOB gate by copying another app's answers.
  Live Anstoss age-rating selections were not verified in this source audit.
- Inspect the final iOS archive's linked frameworks/entitlements. If PassKit is
  linked transitively but unused, explicitly say Apple Pay is not implemented in
  that version's Review Notes; never invent a purchase path for the reviewer.
- Test camera/microphone on a clean install, denial, retry and Settings recovery.
  No cancelable camera/location pre-alert was found in the source audit, but this
  is not a substitute for checking the final submitted binary.
- Resolve billing gates and the separate auth session's security/device gates
  before combining and enabling those features.

- Verify the production EAS build uses remote upload credentials; the native
  release config must not fall back to the debug Android keystore.
- Store listings must not mention beta/test wording.
- App Store Connect privacy labels and Google Play Data Safety must be updated
  before submitting the binary.
- `https://anstoss.io/account-deletion` and `https://anstoss.io/legal.html`
  must be deployed and reachable.
- Android App Links must have the production signing certificate fingerprint in
  the API/web asset links before Play submission.
- The published 30-day account-erasure and 90-day log-retention promises need
  production/supplier evidence; see [retention evidence](deletion-retention-evidence-2026-09-24.md).
- A signed club AVV and verified third-country-transfer mechanisms are needed
  before claiming those safeguards are in force. The current
  [AVV draft](../legal/club-avv-draft-de.md) is not signed.

Apple references checked for this audit:
[Privacy permission guidance](https://developer.apple.com/design/human-interface-guidelines/privacy),
[Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/).

## Android internal testing and Play Console

### Fast tester APK (before Play review)

1. From `apps/mobile`, run
   `eas build --platform android --profile preview`.
2. Wait for EAS to finish, then share the EAS install URL with named testers.
   This profile produces an APK signed with the remote Anstoss upload key and
   uses production backend variables with `EXPO_PUBLIC_APP_STAGE=preview`.
3. Test login/onboarding, club/team membership, chat/realtime, push permission,
   media, events, contributions, and account deletion on at least one current
   Android device and one lower-memory/smaller-screen device.

### Google Play Internal testing

1. Create the Play Console app with package `com.renuirug.anstoss`, default
   language, app/game type, and the required declarations.
2. Enable Play App Signing. Record both certificates: the EAS upload-key
   SHA-256 currently begins `92:FC:95:00`, while the Play App Signing SHA-256
   is generated by Google and will be different.
3. Add **both** SHA-256 fingerprints to the production
   `/.well-known/assetlinks.json`, deploy it on the exact `anstoss.io` host, and
   verify the response is JSON with HTTP 200 before testing links.
4. Complete Store listing, Privacy policy, App access, Ads, Content rating,
   Target audience, Data safety, and account-deletion declarations.
5. Build the store artifact with
   `eas build --platform android --profile production`. This produces the AAB.
6. For the first release, download the AAB from EAS and upload it manually to
   **Testing > Internal testing**, add testers, create the release, and roll it
   out. Automated `eas submit` requires a Google Play service-account JSON and
   cannot be used until that credential is configured.
7. Install from the Play opt-in link and repeat the acceptance matrix. Verify
   App Links from a fresh install and Android push after the FCM V1 key is
   configured in EAS.
