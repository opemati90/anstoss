# FC Treptow fixture integration assessment

Status: researched, not implemented or approved for Anstoss production.

## Evidence inspected

- Public site: https://fc-treptow-site.vercel.app/mannschaften/herren-1
- Local source: `/Users/yemi/fc-treptow-site/src/lib/fussballde.mjs`,
  `api/fixtures.mjs`, `api/_teams.mjs`, and `src/scripts/fixturesLive.ts`.
- Anstoss: `apps/api/src/integrations/fussball.provider.ts`,
  `fussball-scraper.client.ts`, and `fussball.service.ts`.
- DFB terms section 7: https://www.dfb.de/nutzungsbedingungen

The website fetches FUSSBALL.DE HTML server-side, parses upcoming games and
standings, and exposes JSON through its own `/api/fixtures` endpoint. Its
frontend renders custom rows and tables. This is not an official widget embed.
The live endpoint returned games and standings during inspection; this proves
one successful read, not continuing correctness, permitted reuse, or sync.

The server endpoint allowlists three FC Treptow teams and caps each request at
six entries. It is not a general-purpose provider endpoint for Anstoss clubs.
Anstoss deliberately keeps its historical scraper/provider network access off;
its existing official-link and widget metadata paths are distinct from imports.

## Reusable direction, not a drop-in integration

Use native Anstoss presentation over a validated fixture data contract. A
provider adapter must have permission for the intended app use before activation.
DFB's published widget exception concerns non-commercial websites and restricted
source modification; a working website scraper is not evidence of authorization
to redistribute data in Anstoss. Confirm permitted app rendering, caching,
attribution, retention and any restrictions with the source provider.

Do not route Anstoss through the FC Treptow endpoint or copy its scraper as a
workaround. Preserve official links and club-entered fixtures while resolving
the data-source authorization. Do not describe link storage as fixture sync.

## Reliability gaps to resolve before native fixture sync

1. The website returns only five upcoming matches by default, no past scores,
   and no explicit cancellation/reschedule lifecycle. Absence from this window
   must never cancel or delete an Anstoss event.
2. Dates and times are separate local strings without a timezone. Conversion
   needs an explicit source timezone and DST boundary tests, not device timezone.
3. HTML parsing depends on particular classes and cell ordering. Individual
   malformed rows can be skipped and mistaken for a valid empty schedule.
4. `fetchAll` collapses source failures to null and generates a response-level
   `fetchedAt`. This is not a per-component last-success timestamp. The client
   keeps build-time content when refresh fails, without exposing its age.
5. The homepage next-match branch does not clear old content when a successful
   refresh has no next games. A stale match must not remain silently actionable.
6. A page-level provisional marker is applied to all returned games. Preserve
   uncertainty; do not turn this into confirmed kickoff or send definitive
   change notifications without stronger source evidence.
7. Table values need schema validation, season identity and explicit freshness.
   A successful fixture fetch must not imply that standings also refreshed.
8. CDN caching is not a provider rate limiter. Repeated or reordered team pairs
   are not deduplicated/canonicalized; distinct query strings can create separate
   cache entries and redundant upstream requests.

## Verification and independent audit

The three Anstoss reference/provider/scraper regression suites passed: 20 tests.
These prove the tested reference-only behavior, not native fixture ingestion.

An independent read-only adversarial agent reached NO-GO for copying the website
backend into Anstoss. Its mocked upstream response retained a valid tbody but
changed the fixture row class: the parser returned an empty list instead of a
parse failure. It independently confirmed stale-display, missing sync-contract,
partial-failure and cache-key concerns above. The website itself was not modified.

## Acceptance contract for an authorized adapter

- Stable provider/team/match identifiers, club/team authorization, and source
  attribution. Reject unrelated-team records and malformed payloads.
- Independent fixtures/standings status: fresh, stale, unavailable, or empty;
  last successful fetch and source observation timestamps where provided.
- Timezone-aware kickoff, provisional status and explicit cancellation or
  postponement status. Keep missing data separate from deletion.
- Idempotent event upserts by stable external ID, preserving club-entered
  roster selections, availability, attendance and local notes.
- Reschedule/cancellation notifications only after committed state changes,
  with deduplication and retry coverage.
- Bounded requests, payload sizes, retries, source URL allowlists and a provider
  kill switch. Never accept arbitrary server-side fetch URLs from club input.
- Tests for partial outages, schema drift, empty schedules, duplicate IDs,
  DST, season rollover, concurrent sync, revoked club access and offline display.

This assessment does not establish full app or store readiness. No source
integration, production write, Expo build or deployment was performed for it.
