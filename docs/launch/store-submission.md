# Anstoss Store Submission Checklist

Last updated: 2026-06-25

This checklist exists to keep App Store Connect, Play Console, the binary, and
the legal copy aligned. Run `npm run audit:store` before every store submission.

## Review Access

- Apple App Review notes must provide either a real reviewer account or fully
  seeded E2E/demo credentials with access to player, coach, and admin paths.
- Google Play Console > App content > App access must describe the email OTP
  login flow and include reviewer instructions for restricted areas.
- Backend services must be live for the submitted build. `/health` must return
  healthy status before submission.
- Include a join code or demo club path if reviewer accounts are not preloaded
  in production.

## Public URLs

- Privacy policy: `https://anstoss.io/legal.html#datenschutz`
- Terms: `https://anstoss.io/legal.html#nutzungsbedingungen`
- Support/contact: `mailto:kontakt@anstoss.io`
- Account deletion URL for Google Play: `https://anstoss.io/account-deletion`

## Apple App Review Risk Map

- 1.2 User-generated content:
  - In-app report and block actions exist on chat messages.
  - API stores reports, prevents duplicate reports, and auto-hides severe
    abuse/inappropriate reports.
  - Published contact info exists in Legal/Impressum.
- 2.1 App completeness:
  - No beta/test copy in store metadata.
  - Reviewer account or demo mode available.
  - Backend live during review.
- 2.3 Accurate metadata:
  - Screenshots must show actual club/team flows, not unavailable future
    integrations.
  - Do not claim official FUSSBALL.DE/DFBnet live data until licensed.
- 3.1 Payments:
  - Current Stripe flows are for real-world club contributions/dues consumed
    outside the app.
  - Any future paid digital premium feature inside the app must use Apple IAP
    and Google Play Billing unless a documented store exception applies.
- 4.5.4 Push notifications:
  - Push is optional and not required to use the app.
  - No marketing pushes unless the user explicitly opts in.
- 4.8 Login services:
  - Anstoss uses its own email one-time-code account system only. Sign in with
    Apple is not required unless a third-party/social login is added later.
- 5.1 Privacy:
  - Privacy policy is available inside the app and on the website.
  - Account deletion exists inside the app and through the public deletion page.
  - Purpose strings describe the actual photo, camera, and microphone features.
  - The iOS privacy manifest declares app-collected data and no tracking.

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
  - Stripe contribution payments are real-world club payments.
  - Do not add in-app purchase links for digital features without store billing.
- Target audience/content rating:
  - Do not mark as Kids category / Families unless a separate compliance pass is
    completed.
  - Content rating questionnaire must disclose UGC/chat and account creation.

## App Privacy Labels

Use App Store Connect privacy labels and Google Play Data Safety answers that
match these non-tracking categories:

- Contact info: name, email address.
- Identifiers: user ID; device/push token where applicable.
- User content: chat/direct messages, other free-form content, photos/images,
  voice notes.
- Purchases/financial: contribution status, receipts, Stripe references, club
  dues records; payment card/bank details are entered in Stripe-hosted flows.
- Usage/diagnostics: product interaction, crash data, performance data.
- Other data: date of birth, role, membership, team access, RSVP and lineup data.

Do not declare:

- Ads or ad tracking.
- Precise/coarse device location.
- Contacts/phonebook access.
- Health/Fitness APIs.
- SMS/call log access.

## Release Notes Template

Reviewer notes:

```text
Anstoss is a club/team operations app for amateur football clubs.

Login uses Anstoss-owned email one-time codes. No third-party/social login is
used. If you need a pre-seeded reviewer account, use the credentials supplied in
App Review / App access notes, then open More -> Data for export/delete account
controls.

User-generated chat content includes in-app report and block actions. Severe
abuse/inappropriate reports are hidden while admins review them.

Stripe is used only for real-world club contribution/dues payments consumed
outside the app. There are no paid digital premium features in this submission.

Account deletion is available in-app at More -> Data -> Delete account and on
the web at https://anstoss.io/account-deletion.
```

## Blockers Before Submit

- Verify the production EAS build uses remote upload credentials; the native
  release config must not fall back to the debug Android keystore.
- Store listings must not mention beta/test wording.
- App Store Connect privacy labels and Google Play Data Safety must be updated
  before submitting the binary.
- `https://anstoss.io/account-deletion` and `https://anstoss.io/legal.html`
  must be deployed and reachable.
- Android App Links must have the production signing certificate fingerprint in
  the API/web asset links before Play submission.
