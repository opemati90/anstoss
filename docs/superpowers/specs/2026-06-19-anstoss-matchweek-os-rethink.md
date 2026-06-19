# Anstoss Product Rethink - Matchweek Operating System

**Date:** 2026-06-19  
**Status:** Strategy approved for phased implementation

## Product Thesis

Anstoss should not be framed as "another WhatsApp replacement." WhatsApp is where
clubs already talk. Anstoss should become the **matchweek operating system** for
German and European amateur football clubs: the place where the club knows who is
available, who is eligible, who is paid up, who is injured, who needs a ride, who
has not replied, and what the coach or admin needs to do next.

The winning loop is:

```text
Schedule event -> collect availability -> resolve readiness risks -> play match
-> record outcome -> learn for next week
```

Every surface should make that loop clearer for the current role.

## Core Product Pillars

### 1. Event Readiness

Every match or training has a readiness state:

- enough confirmed players
- RSVP response rate
- unresolved non-responders
- injured, suspended, or unavailable players
- check-in and no-show state on matchday
- open logistics or parent conflicts where available
- dues or eligibility risks where available

This becomes the flagship experience because it converts many existing Anstoss
features into one decision: "Can this team actually run the next session?"

### 2. Role-Specific Briefings

Home screens should not be dashboards full of features. They should be briefings.

- Coach: next event readiness, missing replies, position/squad gaps, lineup CTA.
- Player: next action, RSVP/check-in, team chat, relevant announcement.
- Parent: child schedule, conflicts, carpool/payment/consent tasks.
- Admin: club health, teams at risk, overdue dues, pending joins, missing staff.
- Free agent: profile completeness, visibility, shareable player card, trial leads.

### 3. WhatsApp Bridge

The migration path is not "delete WhatsApp today." It is:

- use Anstoss for structured truth
- share Anstoss cards and invite links into WhatsApp
- gradually move repetitive coordination into Anstoss

This removes adoption friction for volunteer-run clubs.

### 4. Matchday Mode

Matchday needs one compressed flow:

- check-in window
- live lineup
- no-shows
- score/events
- substitutions/cards/goals
- MOTM
- recap shared to team channel

This should feel faster than paper, spreadsheets, or group chat.

### 5. Club Operations

German e.V. clubs need more than sport scheduling:

- dues and hardship pauses
- parental consent
- guardians
- volunteer duties
- coach handover
- season rollover
- official fixture imports
- club public page

These features should be exposed as operational tasks, not as a menu maze.

## Navigation Principle

The tab bar remains calm and role-aware:

- Home: briefing and next action
- Events/Schedule: all event history and filters
- Chat/Messages: communication, but not the main product promise
- Squad: roster and readiness context
- More: low-frequency settings and legal/admin tools

Feature discovery should happen through contextual cards on Home, not by adding
more permanent tabs.

## Phased Roadmap

### Wave 1 - Readiness Backbone

Ship the smallest useful version of the new thesis.

- Add Event Readiness Score to event feed items.
- Show a polished Coach Briefing card on coach home.
- Show a compact Admin next-event readiness card.
- Use existing signals only: team size, RSVP counts, date proximity, check-ins,
  and RSVP reasons.
- Add tests for score thresholds and important edge cases.

### Wave 2 - First-Event Adoption

Make a club useful in under 10 minutes.

- Club/team setup wizard with one recommended path.
- Roster import/paste flow.
- WhatsApp-shareable team join link.
- First event creation prompt.
- First RSVP success moment.
- Empty states based on the next required setup action.

### Wave 3 - Smart Reminders and WhatsApp Bridge

Reduce coordination work without forcing behavior change.

- Shareable event readiness card as image/text.
- Smart reminder targets: only non-responders, only overdue dues, only missing
  consent, only event-specific groups.
- Reminder cooldowns visible before sending.
- Announcement templates: schedule change, lineup posted, payment reminder,
  weather/pitch update.

### Wave 4 - Matchday Mode

Make the day of the event feel operationally complete.

- Check-in board.
- Lineup + bench state.
- No-show state after the event window closes.
- Live score/events for match fixtures.
- Post-match recap to announcements/team chat.
- MOTM and attendance streak updates.

### Wave 5 - Parent Logistics

Make parent usage obviously worth installing.

- Multi-child schedule and conflict scanner.
- Carpool seats and driver gaps.
- Payment view.
- Consent status.
- One-tap RSVP per child.
- Guardian-safe messaging and visibility rules.

### Wave 6 - Club Health

Give admins and board members a weekly operating view.

- Teams without next events.
- Teams with low RSVP rate.
- Missing coaches.
- Pending joins.
- Overdue dues.
- Missing parental consent.
- Inactive or stale rosters.
- Season rollover checklist.

### Wave 7 - Football-Native Depth

Differentiate from generic team apps.

- fussball.de fixture import quality checks.
- Player pass/document checklist.
- Suspensions and injury availability.
- Position coverage and missing keeper warnings.
- Trial-player lifecycle.
- Transfer/free-agent workflow after the club product has adoption.

## Edge Case Registry

### Roles and Identity

- User is coach and player in the same club.
- User is parent and coach.
- User belongs to multiple clubs.
- User belongs to multiple teams in one club.
- Coach leaves and no owner/admin is active.
- Duplicate names on roster, siblings, twins, shared devices.
- Roster slot claimed by wrong user.

### Youth and Privacy

- Under-16 user without consent.
- Parent revokes consent.
- Two guardians with different access expectations.
- Injury reason visibility must be limited to the right team roles.
- Attendance/no-show data can shame minors if overexposed.
- DMs involving minors need strict defaults.

### Event Lifecycle

- Event cancelled after users RSVP.
- Match postponed but imported fixture still exists.
- Location changes after reminders were sent.
- Recurring training schedule crosses holidays.
- Daylight-saving/timezone edge cases.
- Event has no location.
- Event has zero active members.
- Event has coaches but no players.

### Matchday Reliability

- Poor network at pitch.
- User opens stale cached event.
- Push arrives late.
- Player checks in after RSVP NO.
- Player RSVPs YES but never checks in.
- Coach needs a paper-like fallback view.
- Device font size set to 200%.

### Payments and Admin

- Parent pays for child.
- Player has multiple contribution plans.
- Failed SEPA mandate.
- Partial payment.
- Long-term injury triggers dues pause suggestion.
- Treasurer leaves the club.
- Refund or manual correction.

### Adoption

- Club wants to keep WhatsApp for social chat.
- Coach refuses email invites.
- Older volunteer struggles with app setup.
- Players install only after seeing a useful event card.
- First event has no replies and looks empty.

## Measurement

Primary activation:

- Club creates first team.
- Coach shares invite link.
- At least 10 players join or claim slots.
- First event gets 70%+ RSVP response.

Weekly value:

- Coach opens readiness card before event.
- Reminder sent to non-responders.
- Players check in or update RSVP.
- Admin resolves at least one pending operational task.

Retention:

- Second event created.
- Three consecutive events with RSVP response.
- At least one parent or admin task completed.
- Match recap or result posted.

## Design Direction

Keep the existing Renuir-derived design system. The product should feel like a
calm operating surface, not a marketing dashboard.

- Home is a briefing, not a mosaic.
- One dominant card per role.
- Dense but readable operational facts.
- Use club primary color for readiness accent, not decoration.
- Use semantic green/yellow/red only where it tells the user what to fix.
- Keep cards to true interactive objects.
- Avoid adding permanent navigation for low-frequency tools.

## Implementation Rule

When adding new capability, attach it to the matchweek loop first. If a feature
does not help schedule, prepare, play, recap, or operate a club event, it belongs
in a later wave or behind contextual discovery.
