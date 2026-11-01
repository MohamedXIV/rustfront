# Rustfront — Progress

Last updated: 2026-11-01

## Current stage
Stage 2 in progress. The battle simulation (2a) is done and pushed. The server match layer (2b) is next.

## Done
- Repository with push access. Design v0.1 in `DESIGN.md`, including the simulation rules.
- Scaffold: Vite 8, TypeScript 5.9 (strict), Phaser 4.2.1, SpacetimeDB SDK 2.14.0, Vitest 5.
- Shared data, one file per category, plus a registry with lookups:
  - 11 structures, 10 units, 5 abilities, 26 cards, and the Headquarters (1000 HP, not a card).
  - Values are drafts. Medium Tank, Machine Gun Turret, Anti-Air Turret, Repair Tower, Drone Swarm, Artillery Strike, and EMP Pulse start from the old 3D-prototype numbers.
- Shared rules, all pure and seedable: match phases, passive and kill income, points, penetration table, time-limit winner, waves, hand and stored slot.
- Stage 2a, battle simulation (`shared/sim`):
  - Arena, territory, placement validation, A* on a 1 m grid, directional armor, accuracy, splash, point defense, repair pulses, EMP fields, mines, delayed abilities, kill rewards.
  - Server-authoritative actions `tryPlayCard` and `tryStoreCard`: validate first, then commit.
  - Outcome: HQ destruction, draw on simultaneous HQ destruction, time limit by HQ HP.
- SpacetimeDB module skeleton (`server/src/index.ts`): player profiles with guest names on connect, and a display-name reducer.
- Client boot scene (`src/scenes/BootScene.ts`).
- CI (GitHub Actions) is green on `c564fbd`:
  - `client` job: install, typecheck, test, build.
  - `spacetime` job: install the SpacetimeDB CLI, start a local server, publish the module, generate client bindings.
- Repository hygiene: `server/node_modules` was committed by mistake in `95846c9`. It was untracked in `6839180`. History was not rewritten.

## Fairness fixes found during Stage 2a
A scripted bot (units only, deployed every 20 s) initially won blue 22 of 30 seeds. Investigation found two causes, both fixed:
1. **First-strike from update order.** Units updated in id order, so the side spawned first stepped into range first and got shot first. The tick is now two-phase: every unit attacks from start-of-tick positions, then units turn and move.
2. **Mirror asymmetry at cell boundaries.** A deploy at an integer coordinate, such as x=12.0, fell into a cell that was not the mirror of the enemy's deploy cell. Units now snap to the centre of the cell they are deployed into.

Also ruled out: card value (200 seeds: red averages 12.44 cost, blue 12.42; power share 12.9% vs 12.8%), deploy order, and perfect accuracy as the cause.

Final check, 120 scripted matches with mirrored, non-integer deploy points: blue 63, red 57. This is within noise.

Caveat: the scripted bot only plays units. It has no structures, abilities, or decisions. This checks symmetry, not balance. Real balance needs playtesting and a stronger bot.

## Verified
- `npm test`: 10 files, 92 tests passing. This includes:
  - A fairness regression test that sweeps starting gaps. Mirrored units must fire on the same tick.
  - A deploy-snap test that mirrored clicks produce mirrored positions.
  - Determinism (same seed, identical snapshots) and a full scripted 10-minute match.
- `npm run typecheck`: client and server both pass with `strict`.
- Browser: boot scene verified in headless Chrome.
- SpacetimeDB 2.x server APIs checked against the installed SDK types.

## Known gaps
- Projectiles resolve instantly. Physical travel time and interception timing are not modeled yet.
- The client does not consume the generated bindings yet. No two-client runtime test exists.
- The CI `spacetime` job starts the server and publishes the module, but does not exercise any reducer.

## Next (Stage 2b, server match layer)
1. Tables: rooms (with join codes), seats, matches, and a configurable tick rate.
2. Reducers: create room, join room, ready, play card, store card. Card reducers call `tryPlayCard` and `tryStoreCard` from `shared/sim`.
3. Tick: one scheduled reducer per match, kept minimal for the free tier.
4. Client: consume the generated bindings, show the hand, and send actions. Nothing counts until the server confirms.
5. CI: a two-client test against the local server, once the client consumes the bindings.

## Open design decisions
See "Open Decisions" in `DESIGN.md`. Still open:
- The Scrappunk → Dieselpunk progression mechanic.
- The Radar Tower effect, and how Artillery accuracy scales with it.
- Reconnect grace period and forfeit rules.
- Matchmaking: room codes first, quick match later.
- Projectile travel time.

Optional, need the user's decision:
- Upgrade TypeScript to 7.x after a compatibility check.
- Rewrite history to remove `server/node_modules` from `95846c9`. This needs a force-push to `main`, which I have not done.
