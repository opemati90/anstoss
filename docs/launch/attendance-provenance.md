# Attendance authorization evidence

The additive attendance migration leaves existing RSVP and check-in records
intact and adds a nullable `playerEligibilityVerifiedAt` timestamp. New writes
set it only after player access, age, account state and (where applicable) the
specific trial session have been checked inside the locked transaction.

Managers can see verified adult records after the player leaves the team or
the trial expires. The adult and non-deleted-user privacy filters still apply;
the marker is not exposed to clients. Existing deletion and retention rules
continue to apply to the original attendance records.

Older records have no evidence that the participant had a valid player role:
older endpoints permitted staff-only responses, and membership and trial data
may have changed or been removed. Such unverified records for past events are
not included in the attendance report; upcoming records are shown only while
the person currently qualifies for that event. They are never deleted or
automatically backfilled with an assumption of legitimacy. Consequently some
old attendance history will remain unavailable after a player leaves. Recovering
it needs trustworthy historical evidence and a separately reviewed process.
# Rejected operation fences

Rejected coach-attendance operations use a separate target-free fence containing
only operation ID, event ID, actor ID and creation time. It prevents a delayed
request from taking effect after a rejection and is not player attendance
history. Fences remain until the event is deleted or the actor's account is
erased; they must not be age-purged while clients can replay unexpired operation
IDs. A serialized per-actor limit of 10,000 fails closed rather than deleting a
fence. The mobile client retains unresolved operations per actor and attempts
reconciliation after login and foregrounding. Confirmed local cleanup is
restartable once its marker is stored. A lost deletion response or crash before
the marker is written remains unresolved; production/device crash behavior
requires verification.
