# Rustfront — Progress

Last updated: 2026-11-02

## Current stage
Stage 3 (browser client) is built. The offline demo runs end to end in headless Chromium. The online path type-checks against the committed bindings, but it has not yet been run in a browser against a live server. Before any real two-player test, the server must stop publishing hidden information (see Known gaps).

## Done
- Repository with push access. Design v0.1 in `DESIGN.md`, including the simulation and server model.
- Scaffold: Vite 8, TypeScript 5.9 (strict), Phaser 4.2.1, SpacetimeDB SDK 2.14.0, Vitest 5.
- Shared data, one file per category, plus a registry with lookups:
  - 11 structures, 10 units, 5 abilities, 26 cards, and the Headquarters (1000 HP, not a card).
  - Values are drafts. Medium Tank, Machine Gun Turret, Anti-Air Turret, Repair Tower, Drone Swarm, Artillery Strike, and EMP Pulse start from the old 3D-prototype numbers.
- Shared rules, all pure and seedable: match phases, passive and kill income, points, penetration table, time-limit winner, waves, hand and stored slot.
- Stage 2a, battle simulation (`shared/sim`): arena, territory, placement validation, A* on a 1 m grid, directional armor, accuracy, splash, point defense, repair pulses, EMP fields, mines, delayed abilities, kill rewards. Server-authoritative `tryPlayCard` and `tryStoreCard`.
- Stage 2b, server match layer (`server/src/index.ts`, `shared/sim/snapshot.ts`): tables, reducers, the scheduled tick, and the `my_hand` view. Each call rebuilds the battle from rows and writes back only what changed. The RNG state is saved, so a restored battle continues exactly like an uninterrupted one.
- Stage 3, browser client (`src/`):
  - Routing: `BootScene` connects, then opens `LobbyScene`. `?demo` skips the server and opens `BattleScene` with the offline source.
  - Session (`src/net/session.ts`): one connection per tab. The identity token lives in localStorage, so a reload reattaches to the same player and battle. `?reset` forgets it. Table changes are batched to one notification per JavaScript task.
  - Lobby (`src/scenes/LobbyScene.ts`): create a room, join by code, ready up, leave. The screen is derived from subscribed rows only. A reload during a battle goes straight back into it.
  - Battle (`src/scenes/BattleScene.ts`): units glide between 100 ms ticks. Territory circles and HQ bars are drawn. Cards can be dragged onto the field or onto STORE, or tapped and then tapped on the field. A card stays on screen as "sending" until the server answers and is never removed locally. Reducer errors appear as toasts. A placement preview shows green or red, with the reason in the help line. The end overlay offers Back to lobby.
  - Visibility (presentational only): enemy mines and enemy concealed units are not drawn.
  - Demo (`src/game/localBattle.ts`): the shared sim runs in the browser. Blue is a simple bot with its own RNG stream. `?seed=N` fixes the match. `?speed=N` (1 to 50) runs faster.
  - Pure view logic (`src/game/view.ts`): geometry, hand layout, visibility, interpolation, outcome, placement hints. Placement hints are tested against the sim's own validators.
  - Placeholder art only: programmatic shapes in team colours. The pixel-art pipeline is a later stage.
- Live test (`live/`): two clients run the lobby, start a battle, deploy a unit, get rejected when playing the other player's card, store a card, and watch the tick advance. It runs in the CI `spacetime` job against SpacetimeDB 2.14.
- Repository hygiene: `server/node_modules` was committed by mistake in `95846c9`. It was untracked in `6839180`. History was not rewritten.

## Verified
- CI green on `69eda71` (before the client): `client` job (typecheck, tests, build), and `spacetime` job (CLI install, server start, module publish, bindings generation, live typecheck, live two-client test).
- Unit tests: 12 files, 113 tests. These include:
  - Snapshot round trip, and a mid-match save and restore that continues identically.
  - A fairness regression test: mirrored units must fire on the same tick.
  - A deploy-snap test: mirrored clicks produce mirrored positions.
  - Determinism, and a full scripted 10-minute match.
  - Placement hints agree with the sim validators on sampled points (both teams, with and without an occupied cell).
- Headless Chromium (Playwright, pre-installed) on the production build:
  - `?demo` renders the field, the HUD, and the hand with no page errors.
  - A drag from the hand deploys an Outpost on the previewed cell. A drop on STORE moves the card to the stored slot.
  - Tapping a card selects it, and the help line shows its description.
  - A match runs to its end, the overlay shows, and NEW DEMO MATCH starts a clean new match with no duplicated HUD.
  - Without a server, the page shows the connection error and a Retry button.
- Not verified: the online lobby and battle in a browser against a live server. The reducers and views are covered by the live test, and the client compiles against the same bindings.

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
- **Hidden information is published.** The server's public tables contain data the client must not see:
  - `entity` includes enemy mines and enemy units that are concealed. The client hides them on screen, but a modified client can read their positions.
  - `battle` includes both players' points.
  - The fix is to move hidden state into private tables and serve per-viewer views (for example `my_entities`, filtered by team, concealment, and mines), and to keep points out of the public battle row. This needs a server change, regenerated bindings, and a live test update. It is the next task.
- The browser client against a live server is not covered by CI. The live Node test covers the reducers and views only.
- Projectiles resolve instantly. Physical travel time and interception timing are not modelled.
- No reconnect grace period, no forfeit, and no way to leave a room while its battle is running. If one player disconnects, the battle keeps running until it ends on time or until the other side destroys the Headquarters.
- The tick rate is fixed at `TICK_MS` (100 ms). It is not configurable yet.
- Each tick reads every row of every active battle. This is not measured under load.
- After a play, the hand compacts: the remaining cards move left. Players may read this as a jump.
- Balance is untested. The demo bot and the scripted test bot cover only a few card types.

## Next
1. Hidden information (see Known gaps). Keep the public tables for what everyone may see, and add per-viewer views for the rest.
2. Playtest two real clients against a local server. Decide whether CI should run a browser test for the online flow.
3. Pixel-art pipeline: decide between programmatic generation and image tools, then make the first sprites.
4. Stage 4 candidates: reconnect and forfeit rules, projectile travel time, configurable tick rate.

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
