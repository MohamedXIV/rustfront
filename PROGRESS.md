# Rustfront — Progress

Last updated: 2026-11-01

## Current stage
Stage 0: repository and design. Done.

## Done
- Repository attached with push access and cloned at `/home/claude/rustfront`.
- Design v0.1 written in `DESIGN.md`. Covers match timing, economy, card system, roster (26 cards), combat rules, placement, and technology direction.
- Reference repos reviewed for balance numbers: `MohamedXIV/rustfront-3d-backup` (`Docs/01-game-design.md`, `Docs/03-content.md`) and `MohamedXIV/rustfront-2d` (inspected only, not used). Old 3D art direction discarded.

## Verified
- Nothing built, run, or tested yet.

## Next (Stage 1: scaffold)
1. Verify current Phaser 4 APIs from official docs and scaffold Vite + TypeScript + Phaser 4.
2. Verify current SpacetimeDB 2.x APIs and check whether the CLI and local runtime work in this environment.
3. Add a data-driven definitions layer for cards, structures, units, and abilities, based on the roster in `DESIGN.md`.
4. Add a minimal project test runner and build script.

## Blockers and dependencies
- Two-client multiplayer tests need a running SpacetimeDB instance. Will confirm local availability in Stage 1.
- Pixel-art generation approach to be chosen in Stage 2 (programmatic generation vs. image tools).

## Open design decisions
See the "Open Decisions" section in `DESIGN.md`.
