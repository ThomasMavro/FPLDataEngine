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

Import the repo in Vercel (framework preset: Vite). `api/fpl.ts` is deployed as a serverless function (the client calls `/api/fpl?path=<path>`) that forwards GET requests to the FPL API, which avoids CORS. `vercel.json` adds an SPA fallback.

## How it works

- Season totals come from `bootstrap-static/`. When a gameweek range or home/away filter is set, stats are re-aggregated from `element-summary/{id}/` history (fetched lazily, 6 at a time, cached in memory).
- Criteria weights are whole percentages that always sum to 100 (changing one rescales the others; "Equalise" resets to equal shares). Each criterion has a higher/lower-is-better direction (default lower for goals conceded, cards, xGC, price...). Score = sum of `weight% * min-max normalised stat` (inverted when lower is better), 0-100, over the filtered pool (optionally per position). Base criteria: goals, assists, total points, clean sheets, defensive contribution (if the API has it), 20% each.
- Optional formation constraint (presets or custom max DEF/MID/FWD) shapes the starting XI, the generator's upgrades and bench advice; squads stay 2/5/5/3.
- Freshness: the edge cache is `s-maxage=300, stale-while-revalidate=60`; the header shows when data was fetched and the current gameweek, with a "Refresh data" button. No FPL data is stored in localStorage (only UI preferences like hidden table columns and league IDs).
- Squad generator: greedy by score with a budget reserve, then single-swap hill climbing. Locked players are kept, excluded players are never used. It is a heuristic, not a proven optimum.

## Not yet done

Free-hit/wildcard planning, price-change prediction.

## Expected points (xP)

`src/lib/xp.ts` documents and implements the xP model (appearance, goals, assists, clean sheets, goals conceded, saves, bonus, defensive contribution, scaled by opponent strength; double GWs summed). "xP (next N GWs)" (N 1-8, default 5) is a table column and a weighting criterion, drives the squad xP chart and per-player detail panel.

## Advice

`src/lib/advice.ts` (pure, unit-tested) drives the Advice panel: best 1 and 2 transfer plans by xP gain over the next N GWs (budget, position and max-3-per-club respected; "-4 hit worth it" when gain > 4), top 3 captain/vice picks, fixture (FDR) swings and easiest runs, bench-for-starter swaps that keep a valid formation, and injury/low-minutes flags.

Mini-league mode takes rival squads (`{ ids, captain }[]`) and computes effective ownership (owners + captains / rivals). Players are labelled differential (EO < 20%) or cover (EO >= 50%). Transfer score is xP x (1 - EO) when chasing and xP x (1 + EO) when protecting. The UI hides this mode until rival data is passed to `AdvicePanel` (`rivals` prop, not wired yet).

## Mini-league

Enter your FPL team ID and a classic mini-league ID (saved in localStorage). The app fetches `leagues-classic/{id}/standings/` (paginated via `page_standings`, passed through the proxy as `/api/fpl?path=...&page_standings=N`), shows the standings with your row highlighted plus your gap to the leader and the manager above, then loads current-GW picks for you and rivals within 10 places (max 20, 4 at a time). Rival starters and captain feed the Advice panel's mini-league mode (effective ownership, differential/cover, chasing vs protecting; default is chasing unless you lead). "Load my team" fills the pitch from your picks; budget is set to current squad prices plus your bank so remaining equals your real bank.
