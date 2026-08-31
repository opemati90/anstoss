# Beta testing distribution (current release)

Last verified: 2026-08-31 18:32 UTC

This is the exact flow to get users on both App Store and Google Play right now.

## iOS (TestFlight)

1. Open TestFlight in App Store Connect for App ID `6761143230`
2. Use one of these active submissions for build `1.0.0 (69)`:
   - `22ae3ab9-fe16-455e-bba5-2d78d8903085`
   - `f4fc0963-1a33-46db-907c-8d945f433f34`
   - `9dd0ff9c-9d2c-42ba-a442-23a2366cc9f2`
3. Add/verify the users in the internal testing group (this is why users currently cannot see/download).
4. Ask users to install TestFlight, accept invite email, and install the app.
5. After install, verify:
   - Login onboarding
   - Club search/join flow
   - RSVP/event workflow
   - Chat send/receive
   - Contributions + account deletion path

If iOS install is still blocked, open the latest submission in ASC and confirm the
build has left `in queue` and is in `internal: in beta testing`.

## Android (fastest for external users)

### A) Direct APK download from EAS (preview build)

Use this only for testing before Google Play rollout:

- APK: `https://expo.dev/artifacts/eas/45zFNTKDAuwIlbbdyEFarjCG1iaCk2GL-QldvMbP-C0.apk`
- Build: `6c876ee7-f67a-481b-99fb-65148bc28563`
- Version code: `10`
- Commit: `dcab8d5e74716527daaa838c13f27abfb4c5c896`

Steps:

1. Open the APK URL on the tester phone.
2. Allow install from unknown sources (first time on that phone profile).
3. Install and run the app.

### B) Google Play internal testing (production artifact)

1. Upload this AAB in Play Console:
   - AAB: `https://expo.dev/artifacts/eas/cBf6cjq0rN3tWdJihhTjVZEqcCncMA6QpkH9mBQjxZk.aab`
   - Build ID: `b8e8c0ff-d30e-4675-9702-f1efb0c5da7f`
   - Version code: `10`
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
