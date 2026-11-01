# Rustfront

Online 1v1 top-down pixel-art RTS with cards. Two players, one battlefield, one Headquarters each.
Design: [`DESIGN.md`](DESIGN.md). Current status: [`PROGRESS.md`](PROGRESS.md).

## Stack
- Phaser 4 (browser client), TypeScript, Vite
- SpacetimeDB 2.x (server module, authoritative state)

## Development

```sh
npm install
npm run dev        # client at http://localhost:5173
npm run typecheck  # client and server module
npm test           # gameplay rule and client view tests (vitest)
npm run test:live  # two-client multiplayer test. Needs a local SpacetimeDB server with the module published (CI does this)
npm run build      # production build into dist/
npm run preview    # serve dist/
```

### Running the client
- **Offline demo:** open `http://localhost:5173/?demo`. The battle runs in the browser against a bot on the blue side. Optional: `?seed=N` fixes the match, `?speed=N` (1 to 50) runs it faster.
- **Online:** needs a SpacetimeDB server on `ws://127.0.0.1:3000` with the module published as `rustfront-ci`. CI publishes it. To point elsewhere, set `VITE_SPACETIME_URI` and `VITE_SPACETIME_DB` at build or dev time. Open two tabs to play yourself, since each tab is its own player.
- `?reset` forgets this tab's player identity.

## Layout
- `shared/` pure game data and rules, used by the client, the server module, and tests
  - `shared/data/` roster definitions (structures, units, abilities, cards)
  - `shared/rules/` economy, combat, match outcome, waves, hand state
  - `shared/sim/` the battle simulation: tick, actions, placement, pathfinding, snapshots
- `src/` Phaser client
  - `src/scenes/` boot (routing), lobby, battle
  - `src/game/` view logic (pure, tested), the demo battle source, and the `BattleSource` interface
  - `src/net/` SpacetimeDB session, lobby view, online battle source
  - `src/render/` drawing helpers. Placeholder art for now.
  - `src/ui/` buttons and toasts
  - `src/module_bindings/` generated client bindings. Committed. CI regenerates them on pushes to `main`.
- `server/` SpacetimeDB module: rooms, seats, battles and entities stored as private rows, reducers, the scheduled tick, and the per-viewer views `my_battle`, `my_entities` and `my_hand`. Publishing needs the SpacetimeDB CLI.
- `live/` two-client multiplayer test against a running server
- `tests/` vitest suites
