# Adult-first release decision — 28 October 2026

The owner explicitly confirmed: **“Yes, launch 18+ first.”** This supersedes
the September 13+ and health-reporting product choices, not privacy obligations.

## Scope

- Adults aged 18+ with a known valid DOB can participate. The old 16+
  declaration and guardian consent are not exemptions.
- Youth participation, guardian-only operation, managed-child onboarding,
  parental invitations/approval, Medic, compliance records and dedicated health
  reporting are unavailable / Coming Soon. No new RSVP reasons or notes.
- Independent adult player/staff roles remain usable on multi-role accounts,
  including an adult with a PARENT membership and separate active player access.
- No automatic deletion or mutation of historical records merely to apply this
  restriction. Operational projections omit excluded people and health fields.
  A bare RSVP preserves stored explanations while suppressing them in responses.
- Export, correction/deletion requests, explicit account deletion and withdrawal
  of existing consent remain available. Never restore erased demo identities.

The source-controlled capabilities are in
`packages/shared/src/constants/launch-features.ts`; reopening these features
requires an intentionally reviewed release, not a production environment toggle.

## Evidence so far (local, not deployed)

- Default-capability API tests cover legacy age declarations, invalid/missing
  DOB, private/group chat, guardian entrypoints, historical health projections,
  dispute recovery, coach/team creation and contribution activation/reminders.
- Default mobile tests cover underage onboarding without a DOB write or guardian
  handoff, adult onboarding, bare NO replies and privacy-only export/deletion.
  Deferred export tests cover account switching, A→B→A and unmounting.
- Isolated PostgreSQL verifier exercises actual participant predicates, rejected
  youth/unknown-age RSVP and loan writes, historical explanation preservation,
  both squad/decline orderings, six simultaneous publications, authority changes,
  loan insertion/reactivation and both account-deletion orderings. It refuses
  production URLs, uses synthetic data and cleans up its fixture.
- Independent adversarial reviewers found and prompted fixes for guardian-only
  messaging targets, disabled-family audience expansion, invalid DOB handling,
  stale privacy exports, recovery-owner bypasses and partial team creation.
  Final re-audit and full-suite verification must be recorded separately.

Legacy youth/health regression suites opt into explicit future-capability test
fixtures. Their success is **not** evidence that youth participation is enabled
or approved in this release. Default suites and PostgreSQL checks do not opt in.

## Still required before submission

Deploy and verify a coordinated API/client/web release only after the remaining
core-product and private-media work passes. Test real iOS and Android accounts,
old sessions, deep links, notifications and privacy exports. No new native/EAS
build was started for this scope change. Simulator mocks do not prove production
behavior, device delivery, performance or legal compliance.

The Play app-signing certificate supplied by the owner is added locally to
`assetlinks.json`; host deployment and Play-installed link verification remain.
Store audience, privacy labels, native manifests, screenshots and public notices
must describe the exact final release rather than this source candidate.

Existing youth/health data is still stored. Restricting features does not establish
its lawful basis, retention or transfer safeguards. Do not declare “no health
data” or “EU compliant” solely from feature flags. The club AVV, actual supplier
terms/transfers, retention evidence and data-subject request operations remain
mandatory where applicable. No lawyer's approval is implied by this document.

References checked 28 October: [Play target audience](https://support.google.com/googleplay/android-developer/answer/9867159),
[Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469),
[Apple privacy declarations](https://developer.apple.com/app-store/app-privacy-details/).
