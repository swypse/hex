# Design: First playable version (start, setup, game screens)

Date: 2026-08-16

## Goal

First runnable version of the hex strategy game: three screens (start, setup, game), a randomly generated hex map rendered with PixiJS sprites, and a players list. No turns, units, economy, or combat yet.

## Stack

- Vite + TypeScript
- PixiJS v8 (sprites from generated textures)
- Vitest for unit tests
- Plain HTML/DOM for all non-game UI (start, setup, players list overlay)

## Screens

### 1. Start screen (default)

- Game title + "Start" button.
- On click: hide start, show setup.

### 2. Setup screen

- Tribe select: Villagers (brown), Warriors (orange), Barbarians (red). One selected by default.
- Enemy count: 1 or 2 (total 2–3 players; tribes are unique, max 3).
- "Start" button → builds player list (human = chosen tribe; AI = remaining tribes), shows game screen.
- No back navigation in this version.

### 3. Game screen

- PixiJS canvas fills viewport, renders generated hex map.
- HTML players list overlay (top corner): tribe name + color dot per player.
- Static map, no interaction.

## Map generation

- Hex-shaped map of axial radius R: R = 4 (61 tiles) for 2 players, R = 5 (91 tiles) for 3 players.
- Seeded RNG for determinism/reproducible tests.

### Settlement placement (wedge sectors)

1. Split map into N equal angular wedges (N = players).
2. Starting village per player: tile nearest the wedge centerline, restricted to non-settlement land types.
3. Reserve the 6-tile ring around it as empty (no settlements).
4. Free (neutral) village per player: in the same wedge, distance ≥ 2 from starting village, ring reserved.
5. Every village has ≥ 1 empty tile around it; reserved ring tiles are settlement-free (rings may share tiles when villages are at distance 2).

### Terrain fill

- Remaining tiles: random from all 8 non-settlement tile types, water/mountain weighted lower.

### Coordinates & rendering

- Logic: axial (q, r). Rendering: pointy-top hexagons, pixel offset from (q, r).
- One texture per tile type + one per tribe color (colored hexagon, darker border).
- Settlement tiles render in owning tribe color; neutral free village in neutral gray.

## Project structure

```
hex/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts               # PixiJS app boot + screen router
│   ├── screens/
│   │   ├── startScreen.ts
│   │   ├── setupScreen.ts
│   │   └── gameScreen.ts
│   ├── game/
│   │   ├── tribes.ts
│   │   ├── players.ts
│   │   ├── hex.ts
│   │   ├── mapGen.ts
│   │   └── tileTypes.ts
│   ├── render/
│   │   ├── textureFactory.ts
│   │   └── mapRenderer.ts
│   └── util/random.ts
└── tests/
```

## Error handling

- Minimal: Start disabled when no tribe selected; map gen is pure and throws on invalid config.

## Testing

- Hex math: neighbors, rings, hex→pixel conversion.
- Map gen: correct size, settlement spacing (≥1 empty neighbor, no overlapping reserved rings), terrain distribution sanity.
