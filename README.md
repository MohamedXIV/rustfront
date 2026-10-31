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
npm run build      # production build into dist/
npm run preview    # serve dist/
```

## Layout
- `shared/` pure game data and rules, used by the client, the server module, and tests
  - `shared/data/` roster definitions (structures, units, abilities, cards)
  - `shared/rules/` economy, combat, match outcome, waves, hand state
- `src/` Phaser client
- `server/` SpacetimeDB module (typechecks; publishing needs the SpacetimeDB CLI)
- `tests/` vitest suites
