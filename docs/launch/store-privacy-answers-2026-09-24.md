# Anstoss store privacy and reviewer-access worksheet

Status: **draft for the account holder to verify in App Store Connect and Play Console** (review-access update 26 September 2026). Do not copy an answer marked `VERIFY` into a live declaration without checking the release binary, SDK report, production configuration, and privacy notice. This worksheet is not a published store declaration.

**28 October scope change, explicitly confirmed by the owner: 18+ first release.** Youth/guardian participation and dedicated health reporting are Coming Soon. Local implementation and tests are not proof of deployment or a submitted binary. This replaces the September product choices below; it does not erase or legalize historical records. See [the current release decision](adult-first-release-2026-10-28.md).

Sources: [Apple App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), [Apple data-type definitions](https://developer.apple.com/app-store/app-privacy-details/), [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [Google target audience](https://support.google.com/googleplay/android-developer/answer/9867159), [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).

## App Store Connect → App Privacy

- Privacy policy URL: `https://anstoss.io/legal.html#datenschutz`; privacy choices/deletion URL: `https://anstoss.io/account-deletion`.
- Select **Yes, data is collected**. The current native privacy manifest (`apps/mobile/ios/Anstoss/PrivacyInfo.xcprivacy`) declares collection and no tracking. The manifest is not a substitute for the App Store Connect questionnaire.
- Baseline purpose for the functional rows below: **App Functionality**. Data is generally **linked to the account**. Product interaction also has **Analytics** in the manifest; crash/performance data support app functionality. **No advertising/tracking** is represented by the current product. Confirm every SDK, including Sentry/Expo, before publishing.

| Apple data type | Actual Anstoss use / evidence | Selection caveat |
| --- | --- | --- |
| Name, email address | Profile and OTP sign-in; user and OTP services | Collected, linked, functionality. |
| User ID, device ID | Account identifiers, push token/device association | Collected, linked, functionality; check whether Apple's “Device ID” definition matches the token actually sent. |
| Emails or text messages; other user content | Team/DM chat, event/poll content, reports | Collected, linked, functionality. |
| Photos or videos; audio data | User-selected uploads and voice messages | Collected when used, linked, functionality. |
| Purchase history / other financial info | Club contribution ledger and optional software-plan references | `VERIFY` whether each Apple subtype is accurate for **real-world club dues**, not in-app purchases. No card details should be declared merely because Stripe is named in the code. |
| Product interaction, crash, performance | Sentry and app diagnostics | Collected; linked while Sentry user ID is set. Do not mark anonymous. |
| Other data types | DOB, role, club/team membership, RSVP and lineups | Collected, linked, functionality. |
| Health / Sensitive Info | The adult-first candidate rejects RSVP reason/note input and suppresses historical operational health fields; Medic/Compliance remain disabled. Historical health/compliance records may still exist and privacy exports retain existing data. | `VERIFY` production, final binary and retained records. Do not remove Health from declarations merely because the UI is hidden. The native manifest conservatively retains `NSPrivacyCollectedDataTypeHealth`; assess historical processing separately. |
| Coarse/precise location / physical address | Free-agent profile can store city and postal code; carpool offers can include free-text departure/pickup location | `VERIFY` Apple's category mapping for user-entered location/address and whether carpool text can identify a precise place. No device GPS permission was found. |
| Documents | Club admins can upload CSV/CAMT bank statement contents for reconciliation | `VERIFY` whether Apple treats the import as “Other User Content”; contents are parsed, not stored as a raw file, but bank transactions are retained. |
| Fitness | Training RSVP/check-in and attendance may describe an individual's exercise activity | `VERIFY` Apple's Fitness definition against actual stored event data. |
| Contacts/social graph | Team, channel and DM participant relationships are stored, without reading the device address book | `VERIFY` Apple's Contacts/social-graph definition; absence of phonebook permission alone does not settle this. |

Do not select behavioral ad-tracking data or **precise device** location unless the final binary or an SDK actually collects them. The app has club-controlled clickable sponsor placement; assess whether the final store form treats this as ads/third-party advertising before answering. Review the Xcode privacy report and SDK manifests for the **exact submitted build**. If `LIBRETRANSLATE_URL` is configured in production, chat/DM text is sent to that endpoint for language detection/translation; determine whether it is self-hosted or an external processor and include it in the supplier/disclosure assessment.

## Play Console → Data safety

Provisional top-level answers: data **is collected**; data **is encrypted in transit** only after verifying every API, WebSocket, media and embedded-widget route uses TLS; users **can request deletion** via the in-app control and public URL. `VERIFY` production deletion behavior and exceptions before asserting completion. No sale or behavioral advertising is implemented. “Shared with third parties” is **not automatically No**: Google's service-provider exception requires the recipient to process only on Anstoss's behalf; the optional FUSSBALL.DE widget is an independent content provider and needs a separate assessment.

| Google Play category | Collected? | Required/optional and purpose | Shared? |
| --- | --- | --- | --- |
| Personal info → Name, Email address, User IDs, Other info (DOB) | Yes | Identity, age gate, access; name/DOB at onboarding, email at login | `VERIFY` processor-only handling. |
| Messages → In-app messages | Yes | Chat/DM, club operations; optional to use chat | `VERIFY` processor-only handling and widget boundary. |
| Photos/videos; Audio files | Yes when uploaded | Profile/club/chat media and voice notes; user-initiated | `VERIFY` R2/Expo processing roles. |
| App activity → App interactions | Yes if Sentry product/trace events are enabled | Diagnostics/analytics | `VERIFY` Sentry data settings. |
| App info and performance → Crash logs, Diagnostics | Yes | Stability and security | `VERIFY` Sentry/Expo processing roles. |
| Device or other IDs | Yes if push/device token and Sentry identifiers are sent | Notifications and diagnostics | `VERIFY` exact SDK values. |
| Financial info → Purchase history / other financial info / User payment info | Club dues status, bank-reference/ledger records, optional subscription metadata; CSV/CAMT raw bytes sent to API can contain full IBANs before in-memory parsing | Club finance operations; no payment card is stored by the current import service | `VERIFY` Google subtypes, ephemeral-processing answer, and actual mobile-accessible fields. |
| Health and fitness → Health info | New dedicated health reporting is disabled in the adult-first candidate; historical health records may remain and be exported | No new RSVP explanation field; continued storage/export of historical records needs assessment | `VERIFY` final binary, production, historical processing and disclosure; the switch alone does not justify answering No. |
| Location → Approximate/precise location or Personal info → Address | `VERIFY` user-entered city/postal code in free-agent profile and free-text carpool pickup/departure points | Player search, club matching and carpool; no GPS collection seen | Classify in current Play form; do not mark all location/address fields No by assumption. |
| Files and docs | `VERIFY` bank CSV/CAMT upload and any other document import | Club contribution reconciliation | Raw file bytes are parsed in memory; derived bank rows persist. |
| Contacts / social graph | `VERIFY` team, channel and DM participant relationships | Club communications | No address-book permission, but Google's social-graph definition may apply. |
| Fitness | `VERIFY` training attendance and check-in | Team event operations | Treat exercise data separately from medic records. |
| Sensitive personal info | `VERIFY` enabled vaccination, medical-check and Führungszeugnis compliance records | Club staff compliance | Disclosure is not a substitute for GDPR Article 9/10 authority. |

Google’s Data safety declaration covers data collected by integrated SDKs. A processor/service provider may be excluded from “shared” under Google's definition, but **not** from “collected.” Verify with each supplier's processing terms; do not infer it from a privacy-policy table.

The 28 October decision supersedes the September request to keep injury/sickness reporting. Historical sensitive records are not automatically purged. Their lawful handling, retention and rights requests still require resolution; adult-only scope is not a substitute for that assessment.

## Play Console → Target audience / content

The owner explicitly chose **18+ only** on 28 October. Select the adult group only after the deployed API, final iOS/Android clients, screenshots and marketing genuinely match that scope. The candidate requires a known adult DOB; a legacy `confirmAdult:true` declaration or guardian consent does not open youth access. Youth/guardian registration, roster activation and dedicated health reporting are unavailable. Retain neutral age entry; do not coach users to enter an adult DOB. Target audience is not the content rating: disclose UGC/chat, account creation and moderation accurately, with no behavioral ad SDK. Club sponsor placement and independent widgets still need their actual current classification. Reopening youth requires a separate reviewed release and updated audience/declarations.

## Play signing and Android App Links

Package: `com.renuirug.anstoss`. The owner supplied the Play app-signing SHA-256 on 28 October: `77:59:FA:F6:E2:90:91:92:AC:DE:B0:2B:4E:E6:82:48:01:8F:9B:6B:97:F2:BD:99:30:C0:0D:B1:03:E2:7B:45`. It is now added to the local `assetlinks.json`, preserving the earlier tester/upload `92:FC:…` certificate. **Not yet deployed or independently compared with the Play-installed APK.** Deploy the exact host's file, then verify Android App Links from a Play-installed build. No signing key was changed or reset. [Android guidance](https://developer.android.com/training/app-links/faq).

## Store-review access (provisioned; store notes still required)

Do **not** provide `admin@anstoss.io` or another production super-admin to reviewers. The local E2E/demo mode is not a production store-review login. The previously proposed `dev@anstoss.io` mailbox was superseded by five dedicated fictional identities: `sofia`, `max`, `tim`, `leo`, and `emir` at `demo.anstoss.app`. Only these allowlisted addresses can use the fixed six-digit review code configured in Railway; it is stored locally at `/Users/yemi/anstoss-backups/review-login-code.txt` with owner-only permissions and must **never** be committed, logged, or pasted into public metadata. Do not reuse it for a real user. All five sample profiles are adults, have no platform-admin role, and belong only to the fictional `FC Musterstadt — Store Review` club. The club, one team, two events, RSVP examples, chat channels and an announcement were created on 26 September 2026 using the collision-checked `apps/api/prisma/seed-store-review.ts`, not the broad development seed. Production API checks returned 200 for review login, `/me`, events, inbox and channels; the clean-install UI walkthrough is still open.

For Apple/Google private review-access notes, provide one or more of these demo emails and the fixed code **directly in the restricted console field**, not in Git or public listing text. The reviewer requests a sign-in code in the app and then enters the supplied fixed code; no email is sent for allowlisted addresses. The code retains OTP expiry, single-use, attempt limits and per-email request caps, so a fresh request is needed for each sign-in. The allowlist controls authentication, **not club isolation**: do not add these identities to a real club or grant them a platform role; inspect memberships before review and rotate/disable the reviewer-code environment variables when review ends. The platform-super-admin portal is not part of this access.

Suggested reviewer notes (replace `[PRIVATE REVIEW CODE]` only inside the stores' restricted review-access form, after a clean-install test):

> Sign in as sofia@demo.anstoss.app. Tap “Send code,” then enter [PRIVATE REVIEW CODE]; no email access is needed for this demo account. The fictional adult-only club is FC Musterstadt — Store Review. Open Home → Events → Chat → Team → Profile to inspect the core flows. To test a coach or player perspective, use max@demo.anstoss.app or tim@demo.anstoss.app with the same review code after requesting it for that address. Account deletion is under Profile → Data and at https://anstoss.io/account-deletion. No subscription purchase or player-dues card payment is offered in this mobile release; club dues are bank-transfer/manual records. Report and block controls are in chat message actions.

Use **emir@demo.anstoss.app only for a one-time account-deletion test**. Do not delete Sofia (club OWNER), Max, or Tim. The seed deliberately refuses to recreate a deleted identity; if Emir is deleted during a review, restore reviewer coverage by creating a new distinct fictional identity and adding it to the private allowlist, never by undoing the deletion. The two sample events are initially four and eight days ahead; immediately before sending review access, run the narrowly scoped seed with `--refresh-events` and `REVIEW_SEED_CONFIRM=fc-musterstadt-review`. It refreshes only those two fictional dates and refuses a modified/partial fixture. Recheck the clean-install UI after refreshing.

## Publication gate

The account holder must compare the worksheet with the final build and console preview, resolve every `VERIFY`, supply reviewer access, and personally approve/publish the declarations. Do not submit a store build on the strength of this document alone.
