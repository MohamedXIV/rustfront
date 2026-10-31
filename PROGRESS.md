# Rustfront — Progress

Last updated: 2026-11-01

## Current stage
Stage 1 (scaffold and core rules): done, except for the blocked items listed below.

## Done
- Repository attached with push access. Design v0.1 committed (`DESIGN.md`).
- Scaffold: Vite 8, TypeScript 5.9 (strict), Phaser 4.2.1, SpacetimeDB SDK 2.14.0, Vitest 5.
- Shared data, one file per category, plus a registry with lookups:
  - 11 structures, 10 units, 5 abilities, 26 cards, and the Headquarters (1000 HP, not a card).
  - Values are drafts. Medium Tank, Machine Gun Turret, Anti-Air Turret, Repair Tower, Drone Swarm, Artillery Strike, and EMP Pulse start from the old 3D-prototype numbers. Everything else is a draft.
- Shared rules, all pure and seedable:
  - Match phases: build 0–6 min, ramp 6–8 min, overtime 8–10 min, ended at 10 min.
  - Passive income: 10 per wave, rising to 15 by 8:00, then ×1.5 (22) in overtime. Kill rewards follow the same multiplier.
  - Points: never negative, failed spends leave the balance unchanged.
  - Penetration table from DESIGN.md.
  - Time-limit winner: the Headquarters with more HP. Equal HP is a draw.
  - Waves: 3 cards, weighted. Power cards ×1.5 during ramp and ×2 in overtime. Hands that are all expensive or three copies of one card are rejected.
  - Hand: unplayed cards expire on each wave. The stored card survives. Storing replaces the previous stored card.
- SpacetimeDB module skeleton (`server/src/index.ts`): player profiles with guest names on connect, and a display-name reducer.
- Client boot scene (`src/scenes/BootScene.ts`).

## Verified
- `npm test`: 6 files, 49 tests passing (data integrity, economy, combat, match outcome, waves, hand transitions).
- `npm run typecheck`: client and server both pass with `strict`.
- `npm run build`: passes.
- Browser: production build served with `vite preview`. Headless Chrome screenshot shows the Phaser boot scene rendering correctly.
- Phaser 4 APIs were checked against the installed type declarations (`Phaser.Game`, `GameConfig`, `Scene`, scale modes).
- SpacetimeDB 2.x server APIs (`schema`, `table`, `t`, `reducer`, `init`, `clientConnected`) were checked against the installed SDK types. The server module typechecks.

## Blocked
- **SpacetimeDB CLI and runtime are not available in this environment.** Checked:
  - `install.spacetimedb.com` is blocked by the egress proxy (403).
  - The GitHub release for `clockworklabs/SpacetimeDB` is blocked. The session has no GitHub access to that repository.
  - `spacetimedb.com` documentation is blocked (403). The SDK's installed README and type declarations were used instead.
  - Docker is installed, but the daemon is not running.
- Consequences:
  - No module bindings can be generated yet (`spacetime generate`).
  - The module cannot be published or run.
  - Two-client multiplayer tests cannot run yet.
- Needed to unblock: the `spacetime` CLI on PATH, or access to its download host.

## Next (Stage 2)
1. Match and room tables: rooms with codes, seats, matches, a configurable tick, and a scheduled wave reducer.
2. Card play through the server: validate cost, availability, and deployment zone. Client shows immediate feedback, but nothing counts until the server confirms.
3. Battlefield simulation (targeting, pathing, combat, armor, repair, abilities) in shared rules so the server stays authoritative.
4. Pixel-art pipeline: decide between programmatic generation and image tools, then generate the first sprites.
5. Card hand UI: dealing animation, drag to play, drag to store.

## Open design decisions
See "Open Decisions" in `DESIGN.md`. Still open: the Scrappunk → Dieselpunk progression mechanic, the Radar Tower effect, pathfinding approach, reconnect grace period, matchmaking details.
