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
npm test           # gameplay rule tests (vitest)
npm run test:live  # two-client multiplayer test. Needs a local SpacetimeDB server with the module published (CI does this)
npm run build      # production build into dist/
npm run preview    # serve dist/
```

## Layout
- `shared/` pure game data and rules, used by the client, the server module, and tests
  - `shared/data/` roster definitions (structures, units, abilities, cards)
  - `shared/rules/` economy, combat, match outcome, waves, hand state
- `src/` Phaser client
- `server/` SpacetimeDB module: rooms, seats, battles stored as rows, reducers, the scheduled tick, and the `my_hand` view. Publishing needs the SpacetimeDB CLI.
- `live/` two-client multiplayer test against a running server
- `tests/` vitest suites
