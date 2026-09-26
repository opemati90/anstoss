# User-generated content moderation

Status: 24 September 2026 (updated after the safeguarding review). Covers Apple App Review Guideline 1.2 and the Google Play User Generated Content policy for Anstoss team chat, channels and direct messages.

## What users can do

| Control | Where in the app | API |
| --- | --- | --- |
| Report a chat or channel message | Long-press a message, then Report | `POST /messages/:id/report` |
| Report a direct message | Long-press the message, or Chat info, then Report | `POST /direct-messages/:id/report` |
| Block a person | Long-press their message, or Chat info in a direct chat, then Block | `POST /users/:id/block`, undo with `DELETE /users/:id/block`, list with `GET /me/blocks` |

Report reasons (API, `REPORT_REASONS` in `packages/shared/src/constants/moderation.ts`): `SPAM`, `ABUSE`, `INAPPROPRIATE`, `SAFEGUARDING` (child safety), `OTHER`. The mobile report sheets (`src/components/chat/ReportSheet.tsx`, `UserReportSheet.tsx`) still offer only spam, abuse, inappropriate and other; adding the child-safety option there is open (see "Still open").

Code: `apps/api/src/moderation/moderation.controller.ts`, mobile `src/components/chat/ChatScreen.tsx` and `app/chat/[id]/info.tsx`.

Blocking takes effect at once for the person who blocks: the blocked user's messages disappear from their chat history and search, and direct conversations with that user are hidden. A report never hides content by itself, so one member cannot silence an announcement. A human moderator decides.

Who may report: a channel message can only be reported by someone who can read that channel (the channel's own access check, `ChannelsService.assertReadableChannel`: club channels, custom groups and visibility rules). A message without a channel uses team read access. A direct message can only be reported by a participant.

## Who moderates

1. **Club moderators (first line).** Every OWNER and ADMIN of the club where the content was posted, in the app (`apps/mobile/app/admin-reports.tsx`) or via the API. They get a push for a new report ("A chat message was reported. Please review it within 24 hours."). Further reports in the next 10 minutes are collected into one push ("3 chat messages were reported ..."), per club and per API instance. The reporter and the reported sender are not notified.
2. **Platform moderators.** Anstoss staff with platform-admin access in the internal admin console (`/admin/moderation/reports`). They see every report from every club, escalated reports first (child safety at the top).

These reports skip the club queue and go **only** to the platform queue (club admins neither see them nor get a push):

- reason `SAFEGUARDING` (child safety). The platform team is alerted immediately.
- the reported sender is staff of that club: OWNER, ADMIN or COACH membership, or an active or pending head/assistant coach of one of its teams. The platform team is alerted. If the sender becomes staff after the report was filed, the report is escalated the moment a club admin tries to resolve it (the admin gets 403).

A club admin can also never resolve a report about their own message.

For a reported direct message, club moderators see only the reported message and its evidence copy, never the rest of the conversation.

Platform alerts are emails to `SAFEGUARDING_ALERT_EMAILS` (comma-separated; falls back to `INTERNAL_ADMIN_EMAILS`) plus an error log line `[moderation:<reason>]` for log alerting. They carry report ids only, never the content. Code: `PlatformSafetyAlerter` in `apps/api/src/moderation/moderation-safety.ts`.

## Response time

- Target: every report is reviewed and resolved **within 24 hours**.
- The club queue lists open reports **oldest first**, so an overdue report is never pushed off the page, and marks those older than 24 hours `overdue: true`.
- Overdue alert: `ModerationSafetyWorker` runs every hour inside the API (setInterval, same pattern as the chat retention worker; on by default, disable with `MODERATION_SAFETY_SWEEP_ENABLED=false`). Each open report older than 24 hours alerts the platform team once and is flagged escalated (`escalationReason = 'overdue'`); the club can still resolve it. Opening the club queue also triggers the check for that club. If the API runs with the sweep disabled, run the equivalent as an external cron (hourly `ModerationSafetyWorker.alertOverdue()`).
- Reports involving a child's safety (grooming, threats, sexual content, self-harm): use the `SAFEGUARDING` reason. Platform staff act at once and, where there is a risk to a child, involve the club's Jugendleiter and, if needed, the police. Do not wait for the 24-hour window.

## How a report is handled

1. Open the queue: club admins in the app or via `GET /clubs/:clubId/moderation/reports?status=open`; platform admins via the admin console.
2. Read the evidence. Each report stores a copy of the message text and, for channel and direct messages, the attachment reference as it was when reported, so later edits cannot hide what was said. The queue returns a signed URL for the attachment that is valid for **5 minutes** (`message.attachment.url` in the club queue, `evidenceAttachmentSignedUrl` in the platform queue). Reload the queue for a fresh link.
3. Decide:
   - **Remove**: `POST /clubs/:clubId/moderation/reports/:reportId/resolve` with `{"action":"remove","resolution":"..."}`. The message is soft-deleted and blanked for everyone (text and attachment, channel and direct), cached translations are deleted, and all other open reports on the same message are closed. The stored media object is moved out of its public path into the private `R2_QUARANTINE_BUCKET` (`quarantine/<source-key-hash>/<name>`) and the reports point at the quarantined copy. Storage or database failures retain the report's source pointer for the worker to retry.
   - **Dismiss**: same endpoint with `{"action":"dismiss"}`. The message and its media stay.
4. If the sender keeps breaking the rules, the club admin removes them from the club or team. The admin console has no account-suspension action yet; until it does, the platform team removes the user from the affected clubs and, for serious cases, deletes the account after preserving the evidence.
5. Every decision writes an `AuditLog` entry (`moderation.report_resolved`, or `admin.moderation_report.resolved` for platform staff) with who acted, when, and what.

Code: `apps/api/src/moderation/club-moderation.service.ts` (club queue), `apps/api/src/admin/moderation.service.ts` (platform queue), `apps/api/src/moderation/moderation-safety.ts` (escalation, alerts, evidence, retention).

## Filtering

There is no automatic word filter. Objectionable content is handled by report, block and removal, plus these limits: chat is only visible to members of the club and the relevant team or channel, direct messages only to the participants, and under-16 users need a guardian's approved consent **for that club and team** to use it (global age gate, see `RELEASE_GATE.md` row 8). If Apple or Google ask for automated filtering, add it to the message send path in `apps/api/src/chat` and document it here.

## Data kept

| Data | Kept for | Removed when |
| --- | --- | --- |
| Report (reason, reporter, evidence text, attachment reference, resolution) | Open reports: until resolved. Resolved reports: evidence is kept **90 days after resolution** (`EVIDENCE_RETENTION_DAYS`), then the evidence text, the attachment reference and the quarantined media object are deleted by the hourly sweep (`evidencePurgedAt` is set). The report row (reason, who, when, decision) stays. | The reporter deletes their account (their reports are deleted), or the reported message is deleted by the chat retention sweep |
| Quarantined media of removed messages | 90 days after the report was resolved | Hourly sweep deletes the quarantined object |
| Removed message | Soft-deleted row with blank text and no attachment | Chat retention sweep |
| Blocks | Until the user unblocks or either account is deleted | Account deletion |
| Moderation audit log | Security audit period (see `docs/launch/data-retention-matrix.md`) | Actor identity is anonymized on account deletion |

A safeguarding case or legal hold that needs evidence longer than 90 days must be exported by platform staff before the window ends; there is no hold flag in the code yet.

## Operations checklist

- Set `SAFEGUARDING_ALERT_EMAILS` in production and test that an alert arrives.
- Configure a separate private `R2_QUARANTINE_BUCKET`, `R2_QUARANTINE_JURISDICTION`, `R2_QUARANTINE_ACCESS_KEY_ID`, and `R2_QUARANTINE_SECRET_ACCESS_KEY`. Set credentials first and bucket last. There is no public-bucket fallback. The production bucket `anstoss-quarantine` uses EU jurisdiction, no r2.dev URL, and no custom domain; its key is scoped only to that bucket.
- Verify private Put/Get/Delete plus the provider's complete move before activation: source becomes 404, evidence is readable with a signed URL, unsigned requests fail, and evidence deletion returns 404. This storage canary passed on 26 September 2026.
- Failed quarantine transfers retain the original report URL as a durable retry pointer. The hourly safety worker retries removed-message attachments; deterministic private keys also recover after source deletion or report update failures. Monitor `quarantine failed` logs while storage is unavailable.
- Evidence retention checks references across channel and direct-message reports. Shared objects survive until all references expire; failed object deletion preserves the pointer for retry. Pending transfers are not purged.
- Retry and purge sweeps use ID-keyset pages, so unprocessable or pending rows do not starve later records. Boundary regressions cover more than 200 retry records and more than 500 retention records in both channel and direct messages.

### Public-release limitations (26 September 2026)

The private-storage canary is not a complete safeguarding sign-off. Existing chat uploads use reusable, ten-minute presigned PUT URLs into a public media bucket; a sender could recreate a removed public object while that URL remains valid. Timestamp-based upload keys also need collision protection. A private origin with authorized delivery, or durable public-edge tombstones, is required before public release. Failed moderation moves currently retry hourly and may leave the original URL accessible meanwhile. Internal testing may proceed, but public submission remains blocked on closing these access-control gaps and validating the failure paths.
- Apply migration `apps/api/prisma/migrations/20260924213000_moderation_safeguarding` before deploying this API.

## Still open

- Mobile report sheets do not offer the `SAFEGUARDING` reason yet (owned by the chat area; the API accepts it and the constant is in `packages/shared`). Needs the option plus translated labels in de, en, fr, it, pt, tr.
- The in-app community rules text (what is not allowed) should be linked from the chat and the terms of use.
- The push batching is per API instance; with several instances each may send its own first push.
