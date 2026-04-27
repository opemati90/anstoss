# Anstoss Phase 4 — Screen Audit

Date: 2026-04-26
Method: §2 of `docs/superpowers/specs/2026-04-26-anstoss-phase4-polish-design.md`.

| Screen | Tokens | Typography | Spacing | Hierarchy | States | Copy | Density | Dark mode | A11y | Motion | Notes | Final |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apps/mobile/app/(auth)/club-create.tsx | PASS | FAIL | FAIL | TBD | N/A | PASS | TBD | TBD | N/A | TBD | raw fontWeight '800' L124; borderRadius: 44 L115 | |
| apps/mobile/app/(auth)/code.tsx | PASS | FAIL | PASS | TBD | N/A | PASS | TBD | TBD | FAIL | TBD | raw fontWeight '600' in resendText style; Pressable missing accessibilityLabel L76 | |
| apps/mobile/app/(auth)/dob.tsx | PASS | FAIL | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | raw fontWeight '700' L125; fontSize via token but fontWeight raw | |
| apps/mobile/app/(auth)/done.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | static confirmation screen; clean | |
| apps/mobile/app/(auth)/free-agent-profile.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | no Text usage; uses WizardStep; all tokens via space/fontSize/fonts | |
| apps/mobile/app/(auth)/name.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | no Text component; uses WizardStep; all tokens via space/fontSize/fonts | |
| apps/mobile/app/(auth)/phone.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | static onboarding step; clean | |
| apps/mobile/app/(auth)/role.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | no Text directly; delegates to RoleCard; gap: space.md clean | |
| apps/mobile/app/(auth)/roster-build.tsx | PASS | FAIL | PASS | TBD | N/A | PASS | TBD | TBD | PASS | TBD | raw fontWeight '700' in addText style L92 | |
| apps/mobile/app/(auth)/roster-claim.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | no Pressable; clean import chain | |
| apps/mobile/app/(auth)/sign-in.tsx | PASS | FAIL | FAIL | TBD | FAIL | FAIL | TBD | TBD | PASS | TBD | inline "Anstoss" string L897; raw fontWeight/fontSize on brand style L1465; paddingTop: 4 L1469; manual loading state (19 refs) | |
| apps/mobile/app/(auth)/team-code-share.tsx | PASS | FAIL | PASS | TBD | N/A | PASS | TBD | TBD | PASS | TBD | raw fontSize: 48 L76; raw fontWeight '800' L76\, '700' L77 | |
| apps/mobile/app/(auth)/team-code.tsx | PASS | FAIL | FAIL | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | raw fontWeight '700' L107; marginTop: 4 L108; manual loading (3 refs\, no state component) | |
| apps/mobile/app/(auth)/welcome.tsx | FAIL | FAIL | FAIL | TBD | N/A | PASS | TBD | TBD | PASS | TBD | imports SCRIM_BASE='#0F1116' used as computed hex; raw fontWeight '600'/'700'/'800' in 6 places; raw fontSize: 30 L168; paddingVertical: 8 L149; borderRadius: 8 L142 | |
| apps/mobile/app/(tabs)/chat/index.tsx | PASS | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | borderRadius: 28 L118 | |
| apps/mobile/app/(tabs)/events/index.tsx | FAIL | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | rgba helper fn L893 (dynamic not literal); paddingVertical: 4 L954 | |
| apps/mobile/app/(tabs)/index.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | thin dispatch screen; delegates to role-aware sub-components | |
| apps/mobile/app/(tabs)/more/index.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | PASS | TBD | clean; all tokens used; accessibilityLabel on Pressables | |
| apps/mobile/app/(tabs)/roster/index.tsx | PASS | FAIL | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xs'] in StyleSheet L1389; padding: 4 L1258; gap: 2 L1261; borderRadius: 9 L1267 | |
| apps/mobile/app/access-blocked.tsx | FAIL | PASS | FAIL | TBD | N/A | PASS | TBD | TBD | N/A | TBD | rgba helper fn L70 (dynamic); borderRadius: 32 L83; no Pressable | |
| apps/mobile/app/account-next-step.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | thin redirect/step-picker; no Pressable | |
| apps/mobile/app/admin-billing.tsx | PASS | FAIL | PASS | TBD | PASS | PASS | TBD | TBD | N/A | TBD | raw fontSize['2xs'] in StyleSheet on 3 lines (L854\, L958\, L1001); no Pressable | |
| apps/mobile/app/admin-contribution-plan.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | uses accessibilityLabel; clean tokens | |
| apps/mobile/app/admin-dashboard.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | manual loading state (no LoadingBoundary); no Pressable | |
| apps/mobile/app/admin-members.tsx | PASS | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | borderRadius: 22 on avatar (L247\, L251); accessibilityLabel present | |
| apps/mobile/app/club-setup.tsx | FAIL | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | 10 raw hex literals (club color palette L25-L34); manual loading state (2 refs) | |
| apps/mobile/app/club-staff.tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xs'] in 2 styles (L1161\, L1174); manual loading state (7 refs) | |
| apps/mobile/app/club-stats.tsx | PASS | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | N/A | TBD | borderRadius: 2 on progress bar (L183\, L189); no Pressable | |
| apps/mobile/app/club/[slug].tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | manual loading state (5 refs\, no LoadingBoundary); no Pressable | |
| apps/mobile/app/create-event.tsx | PASS | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | borderRadius: 3 L723; accessibilityLabel present | |
| apps/mobile/app/dm-chat.tsx | PASS | PASS | FAIL | TBD | N/A | PASS | TBD | TBD | PASS | TBD | borderRadius: 20 L241; marginBottom: 4 L255; no data loading | |
| apps/mobile/app/dm-list.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | PASS | TBD | thin screen delegating to DmListView; clean | |
| apps/mobile/app/dm-new.tsx | PASS | PASS | FAIL | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | paddingTop: 72 L173; borderRadius: 22 L211; manual loading state (6 refs) | |
| apps/mobile/app/edit-profile.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | manual loading state (5 refs\, no state component) | |
| apps/mobile/app/enter-dob.tsx | FAIL | PASS | FAIL | TBD | N/A | PASS | TBD | TBD | N/A | TBD | rgba helper fn L148; borderRadius: 28 L161; Button/Screen used; no Pressable | |
| apps/mobile/app/event-attendance.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | manual loading state (5 refs); no Pressable | |
| apps/mobile/app/event-detail.tsx | FAIL | PASS | FAIL | TBD | PASS | PASS | TBD | TBD | PASS | TBD | rgba helper fn L528; paddingVertical: 4 L556 | |
| apps/mobile/app/find-club.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | manual loading state (7 refs); no Pressable | |
| apps/mobile/app/free-agent/[id].tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['3xl'] in 2 styles (L348\, L356); manual loading state (5 refs) | |
| apps/mobile/app/free-agent/profile.tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xl'] L776; manual loading state (5 refs) | |
| apps/mobile/app/fussball-link.tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xs'] L567; manual loading state (8 refs) | |
| apps/mobile/app/index.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | ActivityIndicator with manual loading; thin router dispatch | |
| apps/mobile/app/invite.tsx | PASS | PASS | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | manual loading state (9 refs); accessibilityLabel present | |
| apps/mobile/app/join-club.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | thin redirect; no styles; no Pressable | |
| apps/mobile/app/join-code.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | uses Button/Card from ui; no Pressable directly | |
| apps/mobile/app/join/[...code].tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xl'] in 3 styles (L562\, L603\, L612); manual loading state (4 refs) | |
| apps/mobile/app/league-table.tsx | PASS | PASS | FAIL | TBD | N/A | PASS | TBD | TBD | N/A | TBD | paddingBottom: 40 L188 (raw literal mixed with space.sm token) | |
| apps/mobile/app/match-detail.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | PASS | TBD | clean; Text variant used correctly; "vs" string L157 is dynamic label not copy | |
| apps/mobile/app/my-contributions.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | N/A | TBD | clean; no Pressable | |
| apps/mobile/app/my-team.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | N/A | TBD | clean; no Pressable | |
| apps/mobile/app/notification-settings.tsx | PASS | PASS | FAIL | TBD | FAIL | PASS | TBD | TBD | N/A | TBD | paddingLeft: 24 + space.sm L466 (mixed literal); manual loading state (5 refs); Switch not Pressable | |
| apps/mobile/app/onboarding.tsx | FAIL | PASS | FAIL | TBD | N/A | PASS | TBD | TBD | PASS | TBD | rgba helper fn L438; borderRadius: 2 (L455\, L460)\, 32 (L498); Text from ui used correctly | |
| apps/mobile/app/parent-schedule.tsx | PASS | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | pure Redirect; no styles or JSX rendered | |
| apps/mobile/app/pending-approval.tsx | FAIL | PASS | PASS | TBD | N/A | PASS | TBD | TBD | N/A | TBD | rgba helper fn L135; no Pressable | |
| apps/mobile/app/pending-requests.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | clean; accessibilityLabel present | |
| apps/mobile/app/player-loan.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | clean; accessibilityLabel present | |
| apps/mobile/app/register/club.tsx | FAIL | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | PASS | TBD | 10 raw hex literals (L12-L13); raw fontFamily on Text L139; inline strings: "Tell us about your club" L46\, "Club name" L50\, "Badge" L62\, "Primary color" L67\, "First team name" L102 | |
| apps/mobile/app/register/finalize.tsx | PASS | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | PASS | TBD | inline fontFamily on Text L150; inline strings: "One last thing" L79\, "Display name" L88\, "Date of birth" L100 | |
| apps/mobile/app/register/free-agent.tsx | PASS | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | N/A | TBD | raw fontFamily on input style; inline string: "City" L113 | |
| apps/mobile/app/register/index.tsx | PASS | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | N/A | TBD | raw fontFamily/fontSize in StyleSheet; hardcoded title/body strings in data array (L23-L52)\, inline "How will you use Anstoss?" L73 | |
| apps/mobile/app/register/join.tsx | PASS | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | N/A | TBD | raw fontFamily/fontSize in StyleSheet; inline strings: "Enter your invite code" L28\, "Invite code" L34\, "Search for your club" L50 | |
| apps/mobile/app/register/parent.tsx | PASS | FAIL | PASS | TBD | N/A | FAIL | TBD | TBD | N/A | TBD | raw fontFamily/fontSize in StyleSheet; inline strings: "Link to your child" L27\, "Approval code" L33 | |
| apps/mobile/app/roster-aggregate.tsx | PASS | FAIL | PASS | TBD | PASS | PASS | TBD | TBD | N/A | TBD | raw fontSize['2xs'] L192; no Pressable | |
| apps/mobile/app/stripe-connect.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | N/A | TBD | clean; no Pressable | |
| apps/mobile/app/team-families.tsx | PASS | FAIL | PASS | TBD | FAIL | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xl'] L449; manual loading state (5 refs); accessibilityLabel present | |
| apps/mobile/app/team-management.tsx | PASS | FAIL | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xs'] L786; accessibilityLabel present | |
| apps/mobile/app/team-matches.tsx | PASS | FAIL | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | raw fontSize['2xs'] L341; accessibilityLabel present | |
| apps/mobile/app/transfer-list.tsx | PASS | PASS | PASS | TBD | PASS | PASS | TBD | TBD | PASS | TBD | clean; accessibilityLabel present | |

## Punch list

### P0 (blocks a flow)

### P1 (visual inconsistency)

- [ ] apps/mobile/app/(auth)/welcome.tsx:142 — borderRadius: 8 (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:149 — paddingVertical: 8 (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:156 — fontWeight: '600' (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:168 — fontSize: 30 (raw literal, not from token)
- [ ] apps/mobile/app/(auth)/welcome.tsx:170 — fontWeight: '800' (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:187 — fontWeight: '700' (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:195 — fontWeight: '700' (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:211 — fontWeight: '800' (raw literal)
- [ ] apps/mobile/app/(auth)/welcome.tsx:225 — fontWeight: '600' (raw literal)
- [ ] apps/mobile/app/(auth)/club-create.tsx:115 — borderRadius: 44 (raw literal)
- [ ] apps/mobile/app/(auth)/club-create.tsx:124 — fontWeight: '800' (raw literal)
- [ ] apps/mobile/app/(auth)/code.tsx — raw fontWeight: '600' in resendText style L100
- [ ] apps/mobile/app/(auth)/dob.tsx:125 — fontWeight: '700' (raw literal)
- [ ] apps/mobile/app/(auth)/roster-build.tsx:92 — fontWeight: '700' in addText style
- [ ] apps/mobile/app/(auth)/sign-in.tsx:1465 — raw fontSize['3xl'] in StyleSheet
- [ ] apps/mobile/app/(auth)/sign-in.tsx:1469 — paddingTop: 4 (raw literal)
- [ ] apps/mobile/app/(auth)/team-code.tsx:107 — fontWeight: '700' (raw literal)
- [ ] apps/mobile/app/(auth)/team-code.tsx:108 — marginTop: 4 (raw literal)
- [ ] apps/mobile/app/(auth)/team-code-share.tsx:76 — fontSize: 48 (raw literal, not from token)
- [ ] apps/mobile/app/(auth)/team-code-share.tsx:76 — fontWeight: '800' (raw literal)
- [ ] apps/mobile/app/(auth)/team-code-share.tsx:77 — fontWeight: '700' (raw literal)
- [ ] apps/mobile/app/(tabs)/chat/index.tsx:118 — borderRadius: 28 (raw literal)
- [ ] apps/mobile/app/(tabs)/events/index.tsx:954 — paddingVertical: 4 (raw literal)
- [ ] apps/mobile/app/(tabs)/roster/index.tsx:1258 — padding: 4 (raw literal)
- [ ] apps/mobile/app/(tabs)/roster/index.tsx:1261 — gap: 2 (raw literal)
- [ ] apps/mobile/app/(tabs)/roster/index.tsx:1267 — borderRadius: 9 (raw literal)
- [ ] apps/mobile/app/(tabs)/roster/index.tsx:1389 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/access-blocked.tsx:83 — borderRadius: 32 (raw literal)
- [ ] apps/mobile/app/admin-billing.tsx:854 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/admin-billing.tsx:958 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/admin-billing.tsx:1001 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/admin-members.tsx:247 — borderRadius: 22 on avatar (raw literal)
- [ ] apps/mobile/app/admin-members.tsx:251 — borderRadius: 22 (raw literal)
- [ ] apps/mobile/app/club-setup.tsx:25-34 — 10 raw hex color literals (club palette array)
- [ ] apps/mobile/app/club-staff.tsx:1161 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/club-staff.tsx:1174 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/club-stats.tsx:183 — borderRadius: 2 on progress bar (raw literal)
- [ ] apps/mobile/app/club-stats.tsx:189 — borderRadius: 2 (raw literal)
- [ ] apps/mobile/app/create-event.tsx:723 — borderRadius: 3 (raw literal)
- [ ] apps/mobile/app/dm-chat.tsx:241 — borderRadius: 20 (raw literal)
- [ ] apps/mobile/app/dm-chat.tsx:255 — marginBottom: 4 (raw literal)
- [ ] apps/mobile/app/dm-new.tsx:173 — paddingTop: 72 (raw literal)
- [ ] apps/mobile/app/dm-new.tsx:211 — borderRadius: 22 (raw literal)
- [ ] apps/mobile/app/enter-dob.tsx:161 — borderRadius: 28 (raw literal)
- [ ] apps/mobile/app/event-detail.tsx:556 — paddingVertical: 4 (raw literal)
- [ ] apps/mobile/app/free-agent/[id].tsx:348 — raw fontSize['3xl'] in StyleSheet
- [ ] apps/mobile/app/free-agent/[id].tsx:356 — raw fontSize['3xl'] in StyleSheet
- [ ] apps/mobile/app/free-agent/profile.tsx:776 — raw fontSize['2xl'] in StyleSheet
- [ ] apps/mobile/app/fussball-link.tsx:567 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/join/[...code].tsx:562 — raw fontSize['2xl'] in StyleSheet
- [ ] apps/mobile/app/join/[...code].tsx:603 — raw fontSize['2xl'] in StyleSheet
- [ ] apps/mobile/app/join/[...code].tsx:612 — raw fontSize['2xl'] in StyleSheet
- [ ] apps/mobile/app/league-table.tsx:188 — paddingBottom: 40 (raw literal mixed with space.sm token)
- [ ] apps/mobile/app/notification-settings.tsx:466 — paddingLeft: 24 + space.sm (raw literal mixed with token)
- [ ] apps/mobile/app/onboarding.tsx:455 — borderRadius: 2 (raw literal)
- [ ] apps/mobile/app/onboarding.tsx:460 — borderRadius: 2 (raw literal)
- [ ] apps/mobile/app/onboarding.tsx:498 — borderRadius: 32 (raw literal)
- [ ] apps/mobile/app/register/club.tsx:12-13 — 10 raw hex literals (club palette array)
- [ ] apps/mobile/app/register/club.tsx:139 — raw fontFamily in StyleSheet input style
- [ ] apps/mobile/app/register/finalize.tsx:150 — inline fontFamily on Text style prop
- [ ] apps/mobile/app/register/finalize.tsx:203-204 — raw fontFamily/fontSize in input StyleSheet
- [ ] apps/mobile/app/register/free-agent.tsx:206-207 — raw fontFamily/fontSize in input StyleSheet
- [ ] apps/mobile/app/register/index.tsx:121-125 — raw fontFamily/fontSize in StyleSheet
- [ ] apps/mobile/app/register/join.tsx:75-83 — raw fontFamily/fontSize in StyleSheet
- [ ] apps/mobile/app/register/parent.tsx:63-71 — raw fontFamily/fontSize in StyleSheet
- [ ] apps/mobile/app/roster-aggregate.tsx:192 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/team-families.tsx:449 — raw fontSize['2xl'] in StyleSheet
- [ ] apps/mobile/app/team-management.tsx:786 — raw fontSize['2xs'] in StyleSheet
- [ ] apps/mobile/app/team-matches.tsx:341 — raw fontSize['2xs'] in StyleSheet

### P2 (polish)

- [ ] apps/mobile/app/(auth)/code.tsx — Pressable missing accessibilityLabel (has accessibilityRole only)
- [ ] apps/mobile/app/(auth)/sign-in.tsx:897 — inline "Anstoss" brand string not in t()
- [ ] apps/mobile/app/register/club.tsx:46 — inline "Tell us about your club" not in t()
- [ ] apps/mobile/app/register/club.tsx:50 — inline "Club name" label not in t()
- [ ] apps/mobile/app/register/club.tsx:62 — inline "Badge" label not in t()
- [ ] apps/mobile/app/register/club.tsx:67 — inline "Primary color" label not in t()
- [ ] apps/mobile/app/register/club.tsx:102 — inline "First team name" label not in t()
- [ ] apps/mobile/app/register/finalize.tsx:79 — inline "One last thing" not in t()
- [ ] apps/mobile/app/register/finalize.tsx:88 — inline "Display name" label not in t()
- [ ] apps/mobile/app/register/finalize.tsx:100 — inline "Date of birth" label not in t()
- [ ] apps/mobile/app/register/free-agent.tsx:113 — inline "City" label not in t()
- [ ] apps/mobile/app/register/index.tsx:23-52 — 10 hardcoded title/body strings in data array not using t()
- [ ] apps/mobile/app/register/index.tsx:73 — inline "How will you use Anstoss?" not in t()
- [ ] apps/mobile/app/register/join.tsx:28 — inline "Enter your invite code" not in t()
- [ ] apps/mobile/app/register/join.tsx:34 — inline "Invite code" label not in t()
- [ ] apps/mobile/app/register/join.tsx:50 — inline "Search for your club" not in t()
- [ ] apps/mobile/app/register/parent.tsx:27 — inline "Link to your child" not in t()
- [ ] apps/mobile/app/register/parent.tsx:33 — inline "Approval code" label not in t()
