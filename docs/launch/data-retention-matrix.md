# Anstoss data-retention matrix

This operational matrix defines the product defaults implemented by scheduled workers. A club remains controller for its member and contribution data; Anstoss acts as processor for those records. Statutory preservation and an active dispute override routine deletion where documented below.

| Data class | Product retention | Disposal | Reason / override |
| --- | --- | --- | --- |
| Raw bank import file | Maximum 24 hours | Automatic object deletion | Reconciliation processing; never retained as the ledger |
| Normalized bank transactions and confirmed/reversed matches | While the club needs its contribution ledger, then the applicable accounting/limitation period | Club export followed by deletion or anonymization under the controller workflow | Accounting evidence and correction history |
| Unaccepted expired or revoked individual invitations | 90 days after terminal state | Hourly automatic row deletion | Abuse investigation and delivery troubleshooting |
| Expired or revoked invite campaign recipient and live code | 90 days after terminal state | Recipient cleared and code irreversibly retired; redemption audit retained | Abuse investigation without retaining reusable credentials or recipient PII |
| Accepted invitations and campaign redemptions | Membership lifecycle plus the applicable security limitation period | Identity anonymization on account deletion; later policy purge | Membership authority and replay prevention |
| Resolved club-claim evidence | 180 days after resolution | Hourly automatic evidence deletion | Preserved while any club dispute is open or frozen |
| Club disputes and ownership-transfer audit events | Applicable governance/security limitation period | Anonymize actor identity where possible, retain decision record | Ownership recovery and fraud prevention |
| Ownership-transfer OTP challenges | Until consumed or expired | Hourly automatic deletion | Transaction security; the code itself is stored only as an HMAC digest |
| Chat and attachments | Club-configured operational period | Soft-delete followed by storage lifecycle deletion | Safeguarding reports or legal hold may extend retention |
| Member profile and operational history | Active membership/account lifecycle | Export, correction, removal, and deletion workflows; identity anonymized where a linked record must remain | Club administration and data-subject rights |
| Security audit events | Applicable security limitation period | Actor identity anonymized on account deletion | Cross-tenant access investigation and compliance evidence |
| Anstoss subscription and invoice references | Statutory bookkeeping period | Automatic deletion after the legal period | Anstoss software billing only; never player dues |

Workers must emit metrics and structured logs for every failed sweep. Operators verify the governance-retention, bank-file-retention, and entitlement-compliance workers during the release canary. Any legal hold must be scoped, documented, reviewed, and removed when no longer required.
