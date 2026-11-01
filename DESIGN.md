# Rustfront — Design (v0.1)

Rustfront is a fast, card-driven, top-down RTS set in a post-apocalyptic world of autonomous scrap-built war machines. Two players, one compact battlefield, one Headquarters each. Units fight on their own; players decide when, where, and what to deploy.

## Pillars
- **Forced adaptation:** no pre-built decks. Cards arrive in waves; play them, store one, or lose them.
- **Real-time combat:** units act continuously. No turns.
- **Stored card:** one saved card creates counterplay and mind games.
- **Readable battlefield:** strong silhouettes, readable projectiles and impacts at all times.
- **Autonomous army:** the player's role is deployment, timing, and positioning.
- **Bounded tempo:** the economy escalates on a timer, so passive play is punished and every match ends on time.

## Match Flow and Time

| Time | Phase | What happens |
|---|---|---|
| 0:00 – 6:00 | Build | Passive income +10 per wave |
| 6:00 – 8:00 | Ramp | Passive income rises linearly from +10 to +15. Power-rarity cards appear more often |
| 8:00 – 10:00 | Overtime | All point income ×1.5 (rounded down). Power cards keep increasing in frequency |
| 10:00 | End | Hard stop (see below) |

**Win conditions:**
- Destroy the enemy Headquarters at any time: immediate win.
- At 10:00: the player whose own Headquarters took **less damage** wins. Equal damage is a draw.

No drought tax and no pressure on the Headquarters during Overtime. Time and escalation are the only forcing mechanisms.

## Headquarters
- 1000 HP. Heavy armor on all sides.
- Cannot be rebuilt.
- Destruction raises `OnBaseDestroyed`, which the server resolves as the match result.

## Economy (Points)
- Points are the in-match resource, separate from any meta currency.
- Server-authoritative. Clients never grant points. Points never go below 0.
- No cap on accumulation. Cards expire, points do not.

**Income:**

| Source | Amount |
|---|---|
| Passive per wave | +10 (rises to +15 at 6:00–8:00, then ×1.5 in Overtime) |
| Destroy light unit | +2 |
| Destroy structure | +5 |
| Destroy heavy unit | +8 |

These numbers are starting values and live in data files.

**Cost bands (per card, set in data):**
- Defensive structures: 8–14
- Units: 10–18
- Abilities: 12–20

## Card System

### Waves
- A wave arrives roughly every 20 seconds (tunable).
- Each wave delivers 3 cards to each player.
- Card choice is weighted random. The generator avoids hands that are all expensive or all duplicates.
- Unplayed cards expire when the next wave arrives.

### Stored slot
- Exactly one stored card at a time. It survives waves until played or replaced.
- Placing a new card in the slot discards the previous stored card.

### Interaction
- Drag to play, drag to store, tap-to-select on mobile, and hover or long-press for descriptions.
- Feedback is immediate on the client. A card is treated as played only after the server confirms.
- Card identities, hands, storage, costs, and execution are server-authoritative and private to each player.

## Roster (26 cards)

Gun Truck is merged into Assault Buggy. The Headquarters is not a card.

### Structures (11)

| Card | Role |
|---|---|
| Outpost | Projects territory. Places a new deployment zone |
| Machine Gun Turret | Fast, accurate fire against light units |
| Heavy Cannon | High damage against armored targets. Slow |
| Mortar | Arc AoE. Needs coverage |
| Rocket Launcher | Long range, anti-armor. Slow reload |
| Flamethrower | Very short range. Cheap. Burn damage |
| Repair Tower | Repairs nearby friendly units and structures |
| Radar Tower | Reveals enemies in range and improves Artillery accuracy |
| Mine Layer | Area denial. Mines trigger on ground units |
| EMP Defense | Static field that disables enemy electronics |
| Anti-Air Turret | Targets air only |

### Units (10)

| Card | Role |
|---|---|
| Scout Buggy | Fast and fragile. Spots and hunts artillery |
| Assault Buggy | Fast. Higher damage. Early pressure |
| Autonomous APC | Medium armor. Point-defense that shoots down missiles and drones |
| Medium Tank | Core frontline unit |
| Heavy Tank | Heavy armor, slow. High penetration |
| Rocket Truck | Long range, anti-armor. Low accuracy |
| Siege Tank | Mobile artillery with arc fire and scatter. Slow |
| Repair Vehicle | Repairs in the field. Fragile |
| Automated Walker | Slow. EMP-immune. Breaks fixed defenses at chokepoints |
| Drone Swarm | Air layer. Attacks ground targets only |

### Abilities (5)

| Card | Role |
|---|---|
| Artillery Strike | Delayed AoE with a visible warning and scatter |
| EMP Pulse | Disables electronics in a radius. Walkers immune |
| Smoke Screen | Hides units inside it from targeting. Supports pushes |
| Emergency Repair | Instant heal in an area |
| Missile Strike | Fast, precise, high damage on single targets. Limited damage against Headquarters |

## Combat

**Layers:** Ground and Air. Each weapon declares what it can target. Ground weapons cannot hit air.

**Armor:** None, Light, Medium, or Heavy, per direction (front, side, rear).

**Penetration multiplier** (penetration rows × armor columns):

| Penetration | None | Light | Medium | Heavy |
|---|---|---|---|---|
| None | ×1.0 | ×0.6 | ×0.3 | ×0.1 |
| Light | ×1.0 | ×1.0 | ×0.6 | ×0.3 |
| Medium | ×1.0 | ×1.0 | ×1.0 | ×0.6 |
| Heavy | ×1.0 | ×1.0 | ×1.0 | ×1.0 |

**Accuracy** is a first-class stat. Turrets are accurate, tanks medium, fast walkers and drones low, artillery scatters.

**Projectiles:** direct (hitscan), physical (travel time, can miss), arc (artillery, scatter on impact), homing (anti-air).

**Readability is non-negotiable:** units identifiable by silhouette, projectiles visible in flight, distinct impact effects, threat indicators for dangerous attacks.

**Soft counters only.** No auto-win matchups. Positioning and timing decide outcomes more than card choice alone.

## Battlefield and Placement

- Compact, symmetrical arena. Terrain forms routes, chokepoints, and flanks. No lanes.
- Structures are grid-placed. Units move freely.
- Territory is runtime data, projected by Headquarters and Outposts (`TerritoryProvider`). Destroying a provider collapses its zone.
- Structures and units must be placed in your own territory. Abilities are exempt and can target anywhere.
- Terrain boundaries are permanent. Structures, units, and barricades are destructible.

## Presentation

- Genuine top-down 2D pixel art. No isometric, no 3D renders.
- Visual progression: Scrappunk, Junkpunk, Rustpunk, Dieselpunk. Gameplay mechanic for this progression is still open (see below).
- Team colors: Player 1 red, Player 2 blue. Done with tint or pre-made color variants.

## Technology

- Phaser 4, TypeScript, Vite.
- SpacetimeDB 2.x owns authoritative state. Clients send actions, never results.
- Subscriptions for match-scoped state. Client interpolation for smooth movement.
- Configurable server tick rate. Scheduled reducers kept minimal to stay within the free tier.

## Simulation Rules (implemented in `shared/sim`)

- Fixed 100 ms tick. Each tick runs: waves, abilities, emitter fields, then every unit attacks using start-of-tick positions and facings, then every unit turns and moves, then mines trigger, then deaths and the outcome are settled.
- Attacks are simultaneous. Entity id order never gives one side a first strike.
- Units deploy at the centre of the cell the player points at. Sub-cell click position has no effect.
- Pathfinding: A* on a 1 m grid, 8 directions, no corner cutting. Replans once per second, or when the next waypoint becomes blocked. Units hold if the goal is unreachable.
- Targeting: a unit keeps its current target while it is valid. Otherwise it takes the nearest valid enemy in range. Structures and units are targetable only while alive and not concealed.
- Projectiles resolve instantly for now. Travel time for physical projectiles is not modeled yet.
- Headquarters destruction ends the match at once. Both Headquarters falling in the same tick is a draw.

## Server Model (implemented in Stage 2b)

- A room holds up to two seats. The creator plays red and the joiner plays blue. When both are ready, a battle starts with a random seed.
- A battle is stored as rows: `battle` (scalars, RNG state, points, wave counters), `entity` and `pending_ability` (public), `entity_ai` and `card` (private). Every reducer and the tick load the battle, run the shared simulation, and write back only the rows that changed.
- Hands are private. The `my_hand` view returns only the caller's own team cards.
- One scheduled reducer, `tick`, advances every running battle by 100 ms. The cost is a full read of each active battle's rows per tick. That is acceptable for the MVP and should be measured before scaling.
- Actions go through the shared rules (`tryPlayCard`, `tryStoreCard`). A rejected action throws, and nothing changes.
- Not yet built: reconnect handling, forfeit, leaving a room, a configurable tick rate (currently fixed at `TICK_MS`), and travel time for projectiles.

## Open Decisions

1. How the Scrappunk → Dieselpunk progression works in gameplay without pay-to-win.
2. Exact Radar Tower effect and how Artillery accuracy scales with it.
3. ~~Pathfinding approach~~ Resolved: A* on a 1 m grid (see Simulation Rules).
4. Reconnect grace period length and forfeit rules.
5. Matchmaking details (room codes first, quick match after).
