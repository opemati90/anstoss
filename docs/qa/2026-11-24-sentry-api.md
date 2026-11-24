# Sentry API incident review — 2026-11-24

The three user-shared reports belong to `opeyemi-ajimati/node` and contain Anstoss API stack paths. Public shared payloads omit release tags, issue counts and full history; this review does not claim to cover every unresolved organisation issue.

- [NODE-5Y](https://opeyemi-ajimati.sentry.io/share/issue/e4c9cb5660684d199bdea0f6762e9bab/): `RangeError: Maximum call stack size exceeded`, repeated frames in `sanitize-store-telemetry`. Shared latest event read at 2026-11-24T09:20:19Z. The recursive telemetry walker lacked cycle/depth protection.
- [NODE-5Q](https://opeyemi-ajimati.sentry.io/share/issue/02ac4e89f72f4c1fbc3d53511947b7f7/): CORS rejection for API-host origin, POST `/api/graphql`, shared latest event 2026-11-22T23:43:38Z. The allowlist rejection used a generic Error and became HTTP 500. No legitimate app failure or reason to broaden the allowlist is established by this sample.
- [NODE-5S](https://opeyemi-ajimati.sentry.io/share/issue/d518503f334d4ef8bfe39f164e632390/): OTP email failed to send, shared latest event 2026-11-16T11:46:59Z. Message-only event; provider status and cause are absent. Do not suppress this issue or label delivery fixed without verification.

## Changes

Telemetry now clones into JSON-safe values with cycle, depth and work limits. It replaces executable serialization hooks and unsupported values, redacts OAuth/OTP and store request bodies consistently across event/transaction/breadcrumb hooks, and returns null on uninspectable input. Source objects are preserved. Sensitive values are never returned as an exhaustion fallback.

CORS keeps the same trusted-origin list; rejected origins become a ForbiddenException handled by the existing application exception filter as HTTP 403. Genuine unexpected errors remain reportable.

## Validation

49 tests passed across telemetry sanitization, CORS and application exception handling. API TypeScript and changed-file ESLint passed. Regressions include cyclic request/socket and array graphs, 10,000-level input, combined deep/wide input, shared objects, throwing getters, executable toJSON, BigInt and serialized purchase credentials. Adversarial review found and drove corrections to serialization-hook leakage and budget exhaustion at the depth limit.

No Sentry issue was resolved/ignored, and no production configuration was modified by this checkout. Deployment and post-deployment verification belong to the combined candidate owner. Live email delivery remains unverified by these tests.
