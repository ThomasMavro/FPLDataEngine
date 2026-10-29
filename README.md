# FPL Decision Engine

Weight the Fantasy Premier League stats you care about, rank every player, and generate the highest-scoring legal 15-man squad (2 GKP / 5 DEF / 5 MID / 3 FWD, max 3 per club, within budget), with the best starting XI and captain.

Vite + React + TypeScript. All data is live from the official FPL API; there is no bundled data (the only fixture data lives in `src/test/` for unit tests). If the API is unreachable the app shows an error state.

## Setup and dev

```bash
npm install
npm run dev      # Vite dev server; /api/fpl/* is proxied to https://fantasy.premierleague.com/api/*
npm test         # Vitest (scoring + squad generator)
npm run build    # type-check + production build
```

## Deploy to Vercel

Import the repo in Vercel (framework preset: Vite). `api/fpl.ts` is deployed as a serverless function (`vercel.json` rewrites `/api/fpl/<path>` to it) that forwards GET requests to the FPL API, which avoids CORS. `vercel.json` adds an SPA fallback.

## How it works

- Season totals come from `bootstrap-static/`. When a gameweek range or home/away filter is set, stats are re-aggregated from `element-summary/{id}/` history (fetched lazily, 6 at a time, cached in memory).
- Score = sum of `weight * min-max normalised stat` over the filtered pool (optionally per position). Weights may be negative.
- Squad generator: greedy by score with a budget reserve, then single-swap hill climbing. Locked players are kept, excluded players are never used. It is a heuristic, not a proven optimum.

## Not yet done

Transfers/free-hit planning, fixture difficulty weighting, price-change prediction, persistence of settings.
