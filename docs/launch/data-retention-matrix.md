# Anstoss data-retention matrix

This operational matrix defines the product defaults implemented by scheduled workers. A club remains controller for its member and contribution data; Anstoss acts as processor for those records. Statutory preservation and an active dispute override routine deletion where documented below.

| Data class | Product retention | Disposal | Reason / override |
| --- | --- | --- | --- |
| Raw bank import request bytes | Parsed in memory; not persisted by the import service | Discarded after request processing | Verify API/proxy/APM request-body logging; do not claim an object-store purge when no object is written |
| Normalized bank transactions and confirmed/reversed matches | While the club needs its contribution ledger, then the applicable accounting/limitation period | Club export followed by deletion or anonymization under the controller workflow | Accounting evidence and correction history |
| Unaccepted expired or revoked individual invitations | 90 days after terminal state | Hourly automatic row deletion | Abuse investigation and delivery troubleshooting |
| Expired or revoked invite campaign recipient and live code | 90 days after terminal state | Recipient cleared and code irreversibly retired; redemption audit retained | Abuse investigation without retaining reusable credentials or recipient PII |
| Accepted invitations and campaign redemptions | Membership lifecycle plus the applicable security limitation period | Identity anonymization on account deletion; later policy purge | Membership authority and replay prevention |
| Resolved club-claim evidence | 180 days after resolution | Hourly automatic evidence deletion | Preserved while any club dispute is open or frozen |
| Club disputes and ownership-transfer audit events | Applicable governance/security limitation period | Anonymize actor identity where possible, retain decision record | Ownership recovery and fraud prevention |
| Ownership-transfer OTP challenges | Until consumed or expired | Hourly automatic deletion | Transaction security; the code itself is stored only as an HMAC digest |
| Chat and attachments | Club-configured operational period | Soft-delete and storage cleanup; private V1 attachment bytes are replaced by a zero-byte barrier, but their storage keys and receipts remain without a verified purge deadline | Safeguarding reports or legal hold may extend retention; V1 barrier metadata requires a safe erasure path and remains a launch gate |
| Member profile and operational history | Active membership/account lifecycle | Export, correction, removal, and deletion workflows; identity anonymized where a linked record must remain | Club administration and data-subject rights |
| Security audit events | Applicable security limitation period | Actor identity anonymized on account deletion | Cross-tenant access investigation and compliance evidence |
| Anstoss subscription and invoice references | Statutory bookkeeping period | Automatic deletion after the legal period | Anstoss software billing only; never player dues |

The governance and chat workers log failures, but their production execution,
alerting, supplier log retention and backup expiry still require evidence.
The chat worker is disabled unless `CHAT_RETENTION_SWEEP_ENABLED=true` and a club
has enabled retention. Operators must verify these settings and actual object
deletion during the release canary. Any legal hold must be scoped, documented,
reviewed, and removed when no longer required. See the
[deletion/retention evidence ledger](deletion-retention-evidence-2026-09-24.md).
