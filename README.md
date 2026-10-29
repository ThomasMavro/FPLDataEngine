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

Import the repo in Vercel (framework preset: Vite). `api/fpl/[...path].ts` is deployed as a serverless function that forwards GET requests to the FPL API, which avoids CORS. `vercel.json` adds an SPA fallback.

## How it works

- Season totals come from `bootstrap-static/`. When a gameweek range or home/away filter is set, stats are re-aggregated from `element-summary/{id}/` history (fetched lazily, 6 at a time, cached in memory).
- Score = sum of `weight * min-max normalised stat` over the filtered pool (optionally per position). Weights may be negative.
- Squad generator: greedy by score with a budget reserve, then single-swap hill climbing. Locked players are kept, excluded players are never used. It is a heuristic, not a proven optimum.

## Not yet done

Free-hit/wildcard planning, price-change prediction, persistence of settings.

## Expected points (xP)

`src/lib/xp.ts` documents and implements the xP model (appearance, goals, assists, clean sheets, goals conceded, saves, bonus, defensive contribution, scaled by opponent strength; double GWs summed). "xP (next N GWs)" (N 1-8, default 5) is a table column and a weighting criterion, drives the squad xP chart and per-player detail panel, and can replace the weighted score in the generator via a toggle.

## Advice

`src/lib/advice.ts` (pure, unit-tested) drives the Advice panel: best 1 and 2 transfer plans by xP gain over the next N GWs (budget, position and max-3-per-club respected; "-4 hit worth it" when gain > 4), top 3 captain/vice picks, fixture (FDR) swings and easiest runs, bench-for-starter swaps that keep a valid formation, and injury/low-minutes flags.

Mini-league mode takes rival squads (`{ ids, captain }[]`) and computes effective ownership (owners + captains / rivals). Players are labelled differential (EO < 20%) or cover (EO >= 50%). Transfer score is xP x (1 - EO) when chasing and xP x (1 + EO) when protecting. The UI hides this mode until rival data is passed to `AdvicePanel` (`rivals` prop, not wired yet).
