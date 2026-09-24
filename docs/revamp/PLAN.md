# Anstoss launch revamp (started 2026-09-23)

Owner brief: revamp the app end to end for every persona (player, coach, club admin, parent, free agent). Terrible UX/UI, inaccessible font sizes, complicated event flow, over-complex chat, disorganized squad and operations. Revamp the trial tab, the trial flow and the transfer market. Make it realistic for German amateur clubs. Polish with high-end visual design + native app design discipline. Fix current errors. Launch ready. Every fix tested by an adversarial agent.

Implementer rules: IMPLEMENTER_RULES.md in this folder.

## Slices

| Slice | Scope | Status |
|---|---|---|
| 0 Design system | accent (club colour, default pitch green #16794A), warm greys, red error, contrast guards both modes, onPrimary, 12pt floor + caption 13, Dynamic Type caps, pill buttons 50pt, e2e persona switch dismisses modals | done by lead |
| 1 Events | one event model (fixtureId FK), Treffpunkt/opponent/Heim-Auswärts, multi-weekday training series, template create form, single event detail (Zusagen/Kader/Fahrten), one RsvpControl with Absage reasons, per-child parent RSVP, event-keyed lineup, real carpool API | built, reviewed, review fixes done |
| 2 Wechselbörse + trials | Gesuche, Spielersuche, Probetraining pipeline, Aufnahmeantrag, Wechsel checklist (Freigabe, Passantrag, spielberechtigt ab), coach can invite, trial ≠ membership, free-agent tabs Entdecken/Probetrainings/Profil; delete transfer-list, scouting, exchange, player-loan | in progress |
| 3 Chat | WhatsApp-style inbox across teams + DMs, conversation push screen, info screen with real mute/pins, new message/group modal with age-rule-aware picker, canWrite respected, Eltern channel for coaches too | built; adversarial review running |
| 3c Chat polish (built, not device-verified) (owner: "not sleek, not polished") | WhatsApp/iMessage-grade: grouped bubbles with in-bubble time + read ticks, day pills, unread divider, swipe-to-reply, long-press reactions + actions, growing composer with send/mic morph, keyboard-tracked on iOS + Android edge-to-edge, media viewer, voice waveform, inbox swipe actions, gesture root mounted; may add react-native-keyboard-controller → dev-client rebuild | in progress with chat fixes |
| 3b DM attachments (owner request) | DirectMessage gets messageType + attachmentUrl + attachmentMeta like channel messages: photos, video, files, voice, and lineup/formation cards shared privately; same upload validation, signed URLs, reporting and retention as team chat | queued with chat review fixes |
| 4 Team tab (Kader) | squad grouped by position with availability, single squadCount, player/injury/requests sheets, Aufgaben on the real duty API, Spiele & Tabelle, Statistik; delete mock-only screens | built, reviewed, review fixes done |
| 5 Club admin | Aufgaben inbox (admin-inbox endpoint), Verein tab (Mitglieder, Mannschaften, Finanzen, Ehrenamt & Kinderschutz, Kommunikation, Einstellungen), compliance reachable, Profile tab per persona | built, reviewed, review fixes done |
| 6 Homes | one-row header, player/coach/parent homes with Treffpunkt, readable RSVP legend, duties, dues; delete legacy home | built, reviewed, review fixes done |
| 7 Onboarding + runtime errors | shortest path per persona, role preference keyed by user, require cycle, language PATCH on launch | queued |
| 7b Localization | native-speaker review of ALL strings in de, en, fr, it, pt, tr (not only new keys; ar is not a registered language): terminology, plurals, register, locale date/number/currency formatting; fix in place; parity specs green | queued (after slices land) |
| 7c Device matrix | iOS: iPhone SE-size, 17 Pro, 17 Pro Max (app is phone-only, portrait); Android: small 360dp phone, Medium Phone API 36; each light + dark, largest text size, Android gesture + 3-button nav. Every persona flow screenshotted per device; fix overflow, clipping, spacing, Android-specific rendering | queued |
| 8 Integration | merge, migrations, full test suite, Maestro flows per persona, screenshot review light + dark, adversarial review per slice, fixes, commit | queued |

## Release gate from the external audit (2026-09-24)

| Item | Owner | Status |
|---|---|---|
| Admin consent inspect leaked other clubs' users (name, email, DOB) | lead | fixed + spec (consent.service.tenant-inspect.spec.ts) |
| Guardian consent withdrawal flow (GDPR Art. 7(3)) with access revocation | safeguarding implementer | in progress |
| Deleting a parent leaves the child's consent and access active | safeguarding implementer | in progress |
| Under-16s can DM each other; group-only rule not enforced | chat implementer | in progress |
| Removed members can read retained DM history | chat implementer | in progress |
| Coaches cannot create trial invites (ADMIN only) | Wechselbörse implementer | in progress |
| Match routed by ±5 min fixture guess instead of fixture id | events implementer | in progress |
| API typecheck, API tests (4 suites/12 tests), mobile tests (10 suites/17 tests), mobile lint (10 errors) red | lead at integration | queued |
| UGC moderation process (Apple 1.2, Play UGC) documented and enforced | safeguarding implementer | in progress |
| Owner/legal items not verifiable from code (privacy labels, Data Safety, Play signing fingerprint, review account, AVV/DPA, SCCs, children's lawful basis, deletion/retention proof) | safeguarding implementer writes docs/compliance/RELEASE_GATE.md; owner signs off | in progress |
| Role-by-role iOS + Android device runs, production canary | lead at integration | queued |

## Device matrix handles
- iOS: iPhone SE 3rd gen "Anstoss SE3" 3FFEBF44-FB3D-4C23-9F38-D21AAB0423CD (375pt), iPhone 17 Pro F4DE2915-2295-4757-A6A2-B2AD7137C166, iPhone 17 Pro Max 99D797C0-1928-4A5C-AA18-F0AD7CB39656. Runtime iOS 26.5.
- Android: AVD Anstoss_Small_360 (small_phone, 360dp), Medium_Phone_API_36.1. Needs a dev build via `npx expo run:android` and `adb reverse tcp:8123 tcp:8123`.

## Integration backlog (lead)
- API push/server locales lack Turkish (apps/api/src/i18n/translations.ts Locale has no `tr`; push templates fall back to de). Add tr everywhere after chat/events fixers finish editing push.templates.ts.
- Streaks and MOTM archive have no team filter (Statistik labels them "im Verein").
- Own-team detection in team-spiele matches first 6 chars of team name; use the fussball team link id.
- Roster reject of a trial player doesn't update the TrialInvite.
- Maestro ad-hoc flows (_recap-*, _demo-coach, _shot-home, _verify-phase0) assert old copy; regenerate or delete.
- Rebuild iOS + Android dev clients (gesture root, possibly react-native-keyboard-controller).
- Legal claims in copy must not overstate (BGB §26).

- Duty kinds are only JERSEY_CLEANUP, BIB_CLEANUP, LOCKER_ROOM. Kuchen/Fahrdienst duties for parents would need new TeamDutyKind values (owner decision).
- Pending-coach approvals route to the Kader tab rather than opening the requests sheet directly.
- Localized match titles ("Heimspiel gegen X") only in events screens + pushes; home cards, chat event cards, conflicts, users.service still show the stored fallback title (opponent / Training). Render via the shared eventFlow.matchTitle helper everywhere.
- fussball.de import notes are English ("Competition: …, Imported from FUSSBALL.DE"): localize or drop.
- Stale Kader nomination cleared on read/save, not at team-leave time.
- Invite re-redemption with the same guardian email resets an APPROVED consent to PENDING (invites.service upsert): keep APPROVED, don't cut the child's access.
- RSVP reminder recipients (events.service.ts ~2228) still include loaned-out players.
- Shirt-number uniqueness is service-level only (no DB unique index; existing duplicates would block one). Concurrent saves could both pass.
- Boot the Nest app once in integration to confirm module wiring (TeamsModule→PushModule, InvitesModule→PushModule, global AgeGate APP_GUARD).
- auth-context.test "keeps team access consistent with the selected persona" fails (expects PLAYER, gets COACH) after the role-mode rework; decide expected behaviour and fix.
- Club ADMIN (not OWNER/Kassenwart) has no BILLING capability, so the Aufgaben inbox hides overdue dues for them (pre-existing).
- `prisma format` rewrote schema.prisma: diff and confirm only intended changes moved.
- Chat "Kopieren" opens the share sheet; add expo-clipboard (native) at the dev-client rebuild.
- Voice message from the + menu only shows a hold-the-mic hint; wire recording.
- No presence API, so no "online" status (acceptable for launch).
- Existing custom groups are not re-checked when staff lose team access (safeguarding rule enforced on create/add/remove only).
- No image re-encode / NSFW step exists for chat or DM media (only size/type checks); decide if launch needs one.
- react-native-keyboard-controller 1.21.9 added: dev-client rebuild required.
- Team chat event notices are posted once per channel in German (CHAT_NOTICE_LOCALE='de'); consider rendering event notices client-side per reader (structured SYSTEM message) so each member sees their language.
- src/i18n/generated/*.ts carry a stale 'AUTO-GENERATED — do not edit' header but no generator exists and they override the base locale at runtime; replace the header with an accurate note (or merge them into the base files) after localization finishes.
- Pre-existing schema drift (also at HEAD, not from the revamp): Message.senderId FK onDelete, EntitlementGrant graceEndsAt index, ContributionRecord.manualPaidAmount nullability, PlatformAdminAccount.updatedAt default. Fix with one reconciling migration.
