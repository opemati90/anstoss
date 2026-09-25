# Anstoss store privacy and reviewer-access worksheet

Status: **draft for the account holder to verify in App Store Connect and Play Console** (24 September 2026). Do not copy an answer marked `VERIFY` into a live declaration without checking the release binary, SDK report, production configuration, and privacy notice. This worksheet is not a published store declaration.

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
| Health / Sensitive Info | Current RSVP accepts explicit `sick`/`injured` reasons and free-text notes; legacy injury/medic records may exist. Compliance records can include vaccination/medical-check and background-check details. | **Health is collected today unless RSVP is changed**, even with Medic/Compliance launch switches off. The native manifest includes Apple's `NSPrivacyCollectedDataTypeHealth`; assess Sensitive Info/Article 10 and historical records separately. |
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
| Health and fitness → Health info | **Yes**: the owner chose to retain RSVP `sick`/`injured` reasons and free-text notes; the separate Medic/Compliance modules are disabled for launch | Player-provided availability reasons, optional within RSVP | `VERIFY` processor sharing, access controls, Article 9 condition and reviewer disclosure before publishing. |
| Location → Approximate/precise location or Personal info → Address | `VERIFY` user-entered city/postal code in free-agent profile and free-text carpool pickup/departure points | Player search, club matching and carpool; no GPS collection seen | Classify in current Play form; do not mark all location/address fields No by assumption. |
| Files and docs | `VERIFY` bank CSV/CAMT upload and any other document import | Club contribution reconciliation | Raw file bytes are parsed in memory; derived bank rows persist. |
| Contacts / social graph | `VERIFY` team, channel and DM participant relationships | Club communications | No address-book permission, but Google's social-graph definition may apply. |
| Fitness | `VERIFY` training attendance and check-in | Team event operations | Treat exercise data separately from medic records. |
| Sensitive personal info | `VERIFY` enabled vaccination, medical-check and Führungszeugnis compliance records | Club staff compliance | Disclosure is not a substitute for GDPR Article 9/10 authority. |

Google’s Data safety declaration covers data collected by integrated SDKs. A processor/service provider may be excluded from “shared” under Google's definition, but **not** from “collected.” Verify with each supplier's processing terms; do not infer it from a privacy-policy table.

The owner confirmed on 24 September 2026 that injury/sickness RSVP reasons and notes must stay. Neither a small scope nor an optional text field removes the need to classify and safeguard health data; the legal decision remains open.

## Play Console → Target audience / content

The owner chose **13+ for direct app users**; younger children are to be guardian-managed, not logged in on their own device. The HTTP age gate and `/me` projection reject known under-13 DOBs, but a DOB-less `confirmAdult:true` profile path currently bypasses that check, and socket/onboarding/existing-session enforcement still needs an end-to-end audit. Candidate age groups are **13–15, 16–17 and relevant adult groups** only after that audit. Do not choose 18+ only to bypass Families rules: 13–15 may be a child audience under Play policy. If any under-13 direct access remains, include the appropriate younger group instead of concealing it. State: **no behavioral ad SDK**, but club-controlled clickable sponsor placements exist and the store's Ads/Families classification needs review; **user-generated chat and media**; **account creation**; **moderation/report/block**. The content-rating questionnaire must describe messaging/UGC honestly.

## Play signing and Android App Links

Package: `com.renuirug.anstoss`. The currently published `https://anstoss.io/.well-known/assetlinks.json` contains SHA-256 `92:FC:95:00:C7:B8:D6:55:9B:82:E4:15:53:9A:6D:D8:97:B4:74:4D:F3:89:EC:99:F5:CD:B3:40:9A:81:A1:CE`, documented as the **upload** certificate. It is **not proof** of the certificate Google uses to sign Play-installed builds. In Play Console, open **Test and release → App integrity → App signing key certificate** and copy its **SHA-256** (not the private key and not Upload key certificate). Add that fingerprint to the existing array, preserving the upload fingerprint for direct tester APKs. Deploy the exact host's `assetlinks.json`, then verify a fresh Play-installed build with Android App Links diagnostics. [Android guidance](https://developer.android.com/training/app-links/faq).

## Store-review access (not yet provisioned)

Do **not** provide `admin@anstoss.io` or another production super-admin to reviewers. The local E2E/demo mode is not a production store-review login. The owner designated a **new, unused** mailbox, `dev@anstoss.io`, for this purpose; its app account and synthetic club are **not yet provisioned or tested**. Give it only ordinary club-level permissions needed for review, never platform-admin rights. Use fictional adult OWNER/COACH/PLAYER profiles only if needed to show each path. No real children, club members, bank details, or production admin powers. OTP must reach that mailbox. To make the OTP flow self-service for reviewers, supply access to the dedicated inbox through the stores' private review/access notes (or another store-accepted test-login method), with unique credentials not reused anywhere else; do not put mailbox credentials, OTPs, or bypasses in Git or this document. Seed deterministic sample fixtures, RSVP, channels and contributions; test from a clean install against production; set a review expiry and revoke access after review. The app's platform-super-admin portal is not part of this review account.

Suggested reviewer notes, only **after** access is tested:

> Sign in with the dedicated review mailbox and the one-time code delivered there. The sample club uses fictional adult members. Open Home → Events → Chat → Team → Profile to inspect the core flows. Account deletion is under Profile → Data and also at https://anstoss.io/account-deletion. No subscription purchase or player-dues card payment is offered in this mobile release; club dues are bank-transfer/manual records. Report and block controls are in chat message actions.

## Publication gate

The account holder must compare the worksheet with the final build and console preview, resolve every `VERIFY`, supply reviewer access, and personally approve/publish the declarations. Do not submit a store build on the strength of this document alone.
