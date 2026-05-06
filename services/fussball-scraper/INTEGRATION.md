# Fussball Scraper Sidecar — Integration Notes

This service is a vendored copy of [Zetabytes/fussball_de_api](https://github.com/Zetabytes/fussball_de_api)
(MIT-licensed, see `LICENSE.txt`). It runs as a standalone Python sidecar
that scrapes [fussball.de](https://www.fussball.de/) and exposes a stable
REST surface that the Anstoss API can fall back to when the primary
upstream (api-fussball.de) misses data.

The upstream `README.md` covers the scraper itself. This file covers
**how Anstoss talks to it**.

## What it adds on top of api-fussball.de

api-fussball.de gives us fixtures, results, table, and post-Spielbericht
lineups. It does **not** expose:

- Venue / pitch address per match (`Game.location`, `Game.location_url`)
- Match progression / events timeline (goals, yellow + red cards,
  substitutions) — the "Time Line" tab on `match-detail.tsx`
- Club search by free-text query

The scraper has all three. The Anstoss API consumes it via
`FussballScraperClient` (see `apps/api/src/integrations/fussball-scraper.client.ts`).

## Deploy

Two reasonable hosts:

### Option A — Railway (recommended for simplicity)

```bash
cd services/fussball-scraper
railway init
railway up
railway variables set API_KEY=$(openssl rand -hex 32)
railway variables set LOG_LEVEL=INFO
railway variables set CACHE_TTL_GAMES=900
railway variables set CACHE_TTL_TABLE=3600
railway variables set CACHE_TTL_TEAMS=7200
# Optional pre-warm — fill in the SV Albatros club ID if you want
# the scraper to keep its caches hot:
# railway variables set PREWARM_CLUB_ID=001VTR8D8C000000VARTQG41VT4929AS
# railway variables set PREWARM_INTERVAL_SECONDS=300
railway domain
```

The Dockerfile in the repo is what Railway builds. Note your domain
(e.g. `https://fussball-scraper-production.up.railway.app`).

### Option B — Fly.io

```bash
cd services/fussball-scraper
fly launch  # accept the suggested name
fly secrets set API_KEY=$(openssl rand -hex 32)
fly deploy
```

### Option C — local dev

```bash
cd services/fussball-scraper
cp .env.example .env
# edit .env: set API_KEY to anything, leave the rest at defaults
docker build -t fussball-scraper .
docker run -p 8000:8000 --env-file .env fussball-scraper
```

Smoke test:
```bash
curl -H "X-API-Key: <your-key>" \
  "http://localhost:8000/api/search/clubs?query=albatros"
```

## Wire into Anstoss API

Set these env vars on the Anstoss API host (Railway → `apps/api`):

```bash
FUSSBALL_SCRAPER_URL=https://fussball-scraper-production.up.railway.app
FUSSBALL_SCRAPER_API_KEY=<the same key you set on the scraper>
```

The API will pick them up on next deploy. Health-check from inside the
API container:

```bash
curl ${FUSSBALL_SCRAPER_URL}/   # public root, no auth
```

## How the API uses it

| Anstoss endpoint | Behaviour |
|---|---|
| `GET /integrations/fussball/match/:externalMatchId/enrichment` | Hits scraper `/api/game/:id`, returns `{ location, locationUrl, events, homeScore, awayScore, status }` for the match-detail Time Line. Returns `null` when the scraper is down or the circuit breaker is open. |
| primary fixture sync (api-fussball.de) | Unchanged. Scraper is fallback-only today. |

The client uses a 3-strike in-memory circuit breaker
(`FussballScraperClient.isAvailable()`) — after 3 consecutive failures
we open the circuit for 60s so a downed scraper doesn't add a 15s
timeout to every request.

## Legal posture

The scraper is operated **by the same operator that hosts Anstoss**, on
behalf of authenticated club admins who are the legitimate owners of
their team's data on DFBnet. This is the same risk profile
api-fussball.de operates under. Keep:

- Caching aggressive (the upstream's defaults — 15min/games, 60min/table, 120min/teams — are fine).
- Attribution `"Quelle: fussball.de"` visible in match-detail UI.
- No rehosting of badge/logo URLs at scale (the scraper has its own
  logo-proxy if you want to avoid hotlinking — set `LOGOS_DIR` and
  serve the proxied PNGs through your CDN).
- Don't ingest player birth dates or photos without GDPR review.

The DFB has not publicly enforced against api-fussball.de in 5+ years
of operation; we operate on the same legal theory but the
*Datenbankherstellerrecht* (§§ 87a-e UrhG) means a takedown letter is
the realistic worst case. Keep the scraper trivially replaceable so
that letter is "stop scraping" and not "bricked product."

## Troubleshooting

### The API never reaches the scraper

Check `FUSSBALL_SCRAPER_URL` and `FUSSBALL_SCRAPER_API_KEY` on the API
host. If both are set and you still see no scraper traffic, the
circuit breaker may be open — check API logs for
`Scraper circuit opened ...` and confirm the scraper itself is
reachable.

### Match events are empty for a finished match

The Spielbericht (post-match official report) is published to
fussball.de **only after the referee submits**, which for amateur tier
is typically Sunday evening or later. Until then, the scraper returns
the match with `status="Beendet"` but `match_events: null`.

### Schema drift breaks the parser

The scraper depends on fussball.de's HTML structure. Upstream re-skins
break it. When `match_events` are unexpectedly empty for matches you
*know* have a Spielbericht, check the upstream Zetabytes repo for
fixes — they tend to land within a week of any major fussball.de
redesign. `git pull` from upstream and redeploy.

## Owner

Vendored by Anstoss · Original: https://github.com/Zetabytes/fussball_de_api
