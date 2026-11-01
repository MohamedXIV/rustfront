# Rustfront — Progress

Last updated: 2026-11-01

## Current stage
Stage 2 is complete as an MVP. The battle simulation (2a) and the server match layer with a live two-client test (2b) are both green in CI. The known gaps are listed below. Next is Stage 3, the browser client.

## Done
- Repository with push access. Design v0.1 in `DESIGN.md`, including the simulation and server model.
- Scaffold: Vite 8, TypeScript 5.9 (strict), Phaser 4.2.1, SpacetimeDB SDK 2.14.0, Vitest 5.
- Shared data, one file per category, plus a registry with lookups:
  - 11 structures, 10 units, 5 abilities, 26 cards, and the Headquarters (1000 HP, not a card).
  - Values are drafts. Medium Tank, Machine Gun Turret, Anti-Air Turret, Repair Tower, Drone Swarm, Artillery Strike, and EMP Pulse start from the old 3D-prototype numbers.
- Shared rules, all pure and seedable: match phases, passive and kill income, points, penetration table, time-limit winner, waves, hand and stored slot.
- Stage 2a, battle simulation (`shared/sim`):
  - Arena, territory, placement validation, A* on a 1 m grid, directional armor, accuracy, splash, point defense, repair pulses, EMP fields, mines, delayed abilities, kill rewards.
  - Server-authoritative actions `tryPlayCard` and `tryStoreCard`: validate first, then commit.
  - Outcome: HQ destruction, draw on simultaneous HQ destruction, time limit by HQ HP.
- Stage 2b, server match layer (`server/src/index.ts`, `shared/sim/snapshot.ts`):
  - Tables: `player`, `room` (join codes), `seat`, `battle`, `entity` (public), `entity_ai` (private), `pending_ability` (public), `card` (private).
  - Reducers: `createRoom`, `joinRoom`, `setReady` (starts the battle when both players are ready), `playCard`, `storeCard`. Card reducers call the shared `tryPlayCard` and `tryStoreCard`.
  - Scheduled `tick` reducer advances every running battle by 100 ms.
  - `my_hand` view: each player sees only their own team's cards.
  - Each call rebuilds the battle from rows and writes back only the rows that changed.
  - The RNG exposes its state, so a battle saved mid-match and restored continues exactly like an uninterrupted one (tested).
- Live test (`live/`): two clients run the lobby, start a battle, deploy a unit, get rejected when playing the other player's card, store a card, and watch the tick advance. It runs in the CI `spacetime` job against SpacetimeDB 2.14.
- Browser: boot scene verified in headless Chrome.
- Repository hygiene: `server/node_modules` was committed by mistake in `95846c9`. It was untracked in `6839180`. History was not rewritten.

## Verified
- CI green on `69eda71`:
  - `client` job: typecheck, 95 unit tests, build.
  - `spacetime` job: CLI install, server start, module publish, bindings generation, live typecheck, live two-client test.
- Unit tests: 11 files, 95 tests. These include:
  - Snapshot round trip, and a mid-match save and restore that continues identically.
  - A fairness regression test: mirrored units must fire on the same tick.
  - A deploy-snap test: mirrored clicks produce mirrored positions.
  - Determinism (same seed, identical snapshots) and a full scripted 10-minute match.

## Fixes found by CI in Stage 2b
- A scheduled reducer must be bound to its schedule table with `onSchedule`, and its payload must be `table.rowType`.
- Generated bindings take an empty params object for reducers with no arguments.
- Reducer calls return promises that reject on server errors. The live test awaits them.

## Fairness fixes (Stage 2a)
A scripted bot (units only, deployed every 20 s) initially won blue 22 of 30 seeds. Investigation found two causes, both fixed:
1. **First-strike from update order.** Units updated in id order, so the side spawned first stepped into range first and got shot first. The tick is now two-phase: every unit attacks from start-of-tick positions, then units turn and move.
2. **Mirror asymmetry at cell boundaries.** A deploy at an integer coordinate, such as x=12.0, fell into a cell that was not the mirror of the enemy's deploy cell. Units now snap to the centre of the cell they are deployed into.

Also ruled out: card value (200 seeds: red averages 12.44 cost, blue 12.42; power share 12.9% vs 12.8%), deploy order, and perfect accuracy as the cause.

Final check, 120 scripted matches with mirrored, non-integer deploy points: blue 63, red 57. This is within noise.

Caveat: the scripted bot only plays units. It has no structures, abilities, or decisions. This checks symmetry, not balance. Real balance needs playtesting and a stronger bot.

## Known gaps
- Projectiles resolve instantly. Physical travel time and interception timing are not modeled yet.
- No reconnect handling, forfeit, or leave-room. A disconnected player's battle keeps running.
- The tick rate is fixed at `TICK_MS` (100 ms). It is not configurable yet.
- The browser client does not use the bindings yet. Only the Node live test does.
- Each tick reads every row of every active battle. This is not measured under load.
- Balance is untested. The bot covers units only.

## Next (Stage 3, browser client)
1. Connect the Phaser client to the bindings. Build the lobby: identity, create room, join by code, ready.
2. Hand UI: show `my_hand`, drag to play, drag to store. Nothing counts as played until the server confirms.
3. Render battle state from `entity` and `pending_ability`, with interpolation between ticks.
4. Pixel-art pipeline: decide between programmatic generation and image tools, then make the first sprites.

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
