# Mobile image upload verification — 2026-10-28

Fixed avatar, club crest and sponsor-logo saves so failed storage PUT responses
cannot be persisted as successful image URLs. Unavailable storage no longer
silently drops a crest edit or saves a device-local sponsor URI. Existing screens
retain edits and display localized errors.

The shared upload helper rejects empty images and invalid/non-HTTPS reservation
URLs, uses an explicit 60-second rejection deadline plus request cancellation,
and does not automatically retry ambiguous writes. Provider errors and signed
URLs are not exposed in its error message. A late successful response after the
deadline cannot acknowledge success.

Verification:

- Full mobile suite: 123 suites passed; 862 tests passed, one skipped.
- Mobile TypeScript and targeted ESLint passed.
- Static store source/configuration audit passed.
- Local production-mode iOS and Android Hermes exports passed. Output is in
  `/private/tmp/anstoss-release-check.uuQVn3/{ios,android}`. These are JavaScript
  bundle checks, not signed native binaries or device tests.
- Independent adversarial review initially identified the advisory-only timeout;
  it passed after the explicit deadline and regression were added. The auditor
  independently ran three suites / 25 tests.
- Six rendered-screen regressions verify failed/disabled uploads do not persist
  broken images, preserve forms and do not navigate away. Avatar success is tested.

These results are local verification, not production/device or store approval.
No EAS build, production deployment or feature-flag change was performed.
