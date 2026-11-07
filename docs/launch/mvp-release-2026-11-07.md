# MVP testing release — 7 November 2026

## Artifacts

Version **1.0.1**, bundle/package **com.renuirug.anstoss**, mobile source
`edef4b576de242f51975ec03f2ea33702315c129`, runtime **57.0.1**.

- [iOS build 88](https://expo.dev/accounts/opemati1521/projects/anstoss/builds/b886fe9a-20cc-4a69-a8fd-9e4a16b38bd5): finished.
- [App Store Connect upload](https://expo.dev/accounts/opemati1521/projects/anstoss/submissions/8fb7da08-600a-4a7d-9469-b38de000026a): finished; allow Apple processing before selecting it in TestFlight.
- [Android AAB 23](https://expo.dev/accounts/opemati1521/projects/anstoss/builds/e10e026b-7071-4258-aaf4-3f7392f9bad8): finished; upload to Play Console → Testing → Internal testing. No public rollout was performed.

Local files, screenshot ZIPs, preview and this handoff are in
`~/Downloads/Anstoss-MVP-2026-11-07/`. The AAB is a Play upload artifact, not a
directly installable APK. Existing Expo credentials were used; no infrastructure
upgrade or new paid service was purchased.

## Verified

- API deployed and healthy with all 87 migrations finished.
- Live player join → admin approval → active team access.
- Live player availability → coach summary; squad/reminder endpoints.
- Live coach-recorded attendance → admin read and idempotent retry.
- Live private channel and DM image upload, publish/retry, authorized read,
  unauthorized denial, account erasure and blocked content resurrection.
- German simulator player/coach/admin checks and RSVP controls in all six app languages.
- Owner/coach/player store-review login and schedule access.
- Fresh six-screen artwork and Play feature graphic independently reviewed;
  ZIP content integrity tests passed.

Detailed evidence and retained-metadata limits are in `operations-runbook.md`.
These checks do not establish physical-device push/media playback, ordinary
email delivery, exhaustive localization, legal certification, or store approval.

## Store-review access

Use Sofia (`sofia@demo.anstoss.app`), Max (`max@demo.anstoss.app`), or Tim
(`tim@demo.anstoss.app`) in the stores' private reviewer-access fields. Request
a code in the app, then enter the fixed review code from the owner-only file
`~/anstoss-backups/review-login-code.txt`. Never place the code in a public
listing or repository. The accounts belong only to the fictional review club
and have no platform-admin authority. Do not delete these three accounts.

The sample schedule was refreshed to upcoming dates. Reviewer instructions,
privacy declarations and public URLs are in `store-submission.md` and
`store-privacy-answers-2026-09-24.md`. Store-console declarations still need to
match the submitted app; generating binaries does not submit those answers.
