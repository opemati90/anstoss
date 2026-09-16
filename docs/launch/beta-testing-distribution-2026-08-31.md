# Beta testing distribution (current release)

Last verified: 2026-09-16 10:37 UTC

This is the exact flow to get users on both App Store and Google Play right now.

## iOS (TestFlight)

1. Open TestFlight in App Store Connect for App ID `6761143230`
2. Use the current submitted build `1.0.0 (82)`:
   - Build ID: `175fc0f2-68c2-4b56-ab3f-ef0ba217b0c9`
   - Commit: `ee8809c38c44d0d3a36cebb04d1e5bd9f427bd52`
   - Submission ID: `277ceefe-87f5-48c5-9f70-c04aac3035be`
   - Submission status at verification: `FINISHED`
3. Add/verify the users in the internal testing group (this is why users currently cannot see/download).
4. Ask users to install TestFlight, accept invite email, and install the app.
5. After install, verify:
   - Login onboarding
   - Club search/join flow
   - RSVP/event workflow
   - Chat send/receive
   - Contributions + account deletion path

If iOS install is still blocked, open the latest submission in ASC and confirm
Apple has completed its post-upload processing and the build is available to the
internal testing group.

## Android (fastest for external users)

### A) Direct APK download from EAS (preview build)

Use this only for quick ad-hoc testing before Google Play rollout. It is not the
current Play production artifact:

- APK: `https://expo.dev/artifacts/eas/45zFNTKDAuwIlbbdyEFarjCG1iaCk2GL-QldvMbP-C0.apk`
- Build: `6c876ee7-f67a-481b-99fb-65148bc28563`
- Version code: `10`
- Commit: `dcab8d5e74716527daaa838c13f27abfb4c5c896`

Steps:

1. Open the APK URL on the tester phone.
2. Allow install from unknown sources (first time on that phone profile).
3. Install and run the app.

### B) Google Play internal testing (production artifact)

1. Upload the latest production AAB in Play Console:
   - AAB: `https://expo.dev/artifacts/eas/5pLn9n4iUw1TInoijBc4Pn_ZhK0d7fWfNjpysj5UifA.aab`
   - Build ID: `c81a7bca-600c-4469-965e-74f084b33319`
   - Version code: `19`
   - Commit: `ee8809c38c44d0d3a36cebb04d1e5bd9f427bd52`
   - Status at verification: `FINISHED` on EAS
2. In Play Console, create a Play internal testing track and add tester group.
3. Open the generated opt-in URL and send it to testers.
4. If you only need quick testing, continue with direct APK while Google Play review is pending.

## Play release path (without service-account submit automation)

You can ship to testers and release without enforcing service-account based
automated submission:

- Android preview APK for ad-hoc testing.
- Manual AAB upload for internal testing/Play rollout.

If/when you want one-click automated Android submission, set up service-account
credentials in EAS and then use `eas submit`. Until then, follow the manual path
above.
