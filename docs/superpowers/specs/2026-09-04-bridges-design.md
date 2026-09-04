# Bridges

## Overview

A **bridge** is a crossing the player builds on a single water hex between two land
shores. It is a level-2 skill-gated structure (new **Bridges** skill, child of Riding)
that behaves as the owner's road tile for movement and road connectivity, stays
passable to ships, and scores +5 per owned bridge at game end. It does not consume a
village building slot.

Decisions confirmed with the owner:

- The player **selects the water hex** and presses a "Build bridge" toolbar button when it is valid.
- The two shores need **no ownership** — any non-water land works (another player's or unowned too).
- **Ships can still sail through** the bridged water hex.
- **AI players can build bridges** when they have the skill.
- Bridges give **+5 game-end score each** and use **no village building slot**.

## Changes

### 1. Skill (`src/game/skills.ts`)

- Add `'bridges'` to `SkillId`.
- `SKILLS.bridges`: `{ id: 'bridges', name: 'Bridges', level: 2, parent: 'riding',
  description: 'Allows building bridges across water (10 wood, 15 money, 5 stone).' }`.
- Cost follows `skillCost` (level 2 → base 6, same as other level-2 skills).

### 2. Map data (`src/game/mapGen.ts`)

- Add to `MapTile`:
  ```ts
  bridge?: { owner: number; dir: BridgeDir } | null;
  ```
  with `export type BridgeDir = 'nw' | 'ne' | 'we'`.
- Optional field; existing snapshots/tests without it are unaffected. New bridges also
  set `tile.roadOwner = owner` (the bridge is the owner's road).
- New file `src/game/bridges.ts` (pure): cost, direction detection, build rules.

### 3. Build rules (`src/game/bridges.ts`, `src/game/buildings.ts`, toolbar)

- `BRIDGE_COST = { wood: 10, stone: 5, money: 15, ore: 0 }`.
- `bridgeDirFor(map, tile): BridgeDir | null` — the water tile must have one pair of
  *opposite* hex neighbours that are both non-water land. Axes: east/west → `we`,
  ne/sw → `ne`, nw/se → `nw`.
- `canBuildBridge(map, tile, player): boolean` — Bridges skill; tile is water; no
  `tile.building`, no `tile.bridge`, no `tile.unit`; affordable; `bridgeDirFor` non-null.
- `buildBridge(map, tile, player): boolean` — pays `BRIDGE_COST`, sets
  `tile.bridge = { owner: player.index, dir }` and `tile.roadOwner = player.index`.
- `canBuildPort` and `canBuildTemple` return `false` when `tile.bridge` is set (ports and
  water temples cannot be built on a bridge). No other building can target water.
- Toolbar (`src/ui/hud/toolbarSpecs.ts`): when the selected tile passes
  `canBuildBridge`, show `Build bridge (10w, 5s, 15m)` (disabled when unaffordable);
  onClick dispatches the new bridge command.

### 4. Simulation and events

- New `Command` `{ type: 'buildBridge'; q: number; r: number }` in
  `src/game/simulator.ts`; `doBuildBridge` calls `buildBridge` and emits
  `{ type: 'bridgeBuilt'; q; r; playerIndex }`.
- New `GameEvent` `{ type: 'bridgeBuilt'; q: number; r: number; playerIndex: number }`
  in `src/game/events.ts` (no animation presentation needed — the map re-renders).
- `gameController` mirrors the existing `buildSelectedBuilding`/`buildSelectedRoad`
  plumbing for bridges.

### 5. Movement and pathing (`src/game/selection.ts`)

- Bridged water is passable by **land units** and (as today) by ships. Update the
  Water checks in `reachableTargets` and `pathBetween`: for a non-ship unit a Water tile
  is allowed when `tile.bridge` is present, in addition to the existing port-dock case.
  Ships keep treating every water tile (bridged or not) as open water.
- No change to `moveRange` road bonus: the bridge tile carries `roadOwner = owner`, so the
  owner already gets the +1-from-own-road rule; enemies may still stand/walk on it.

### 6. Road connectivity (`src/game/roads.ts`)

- No code change required for connectivity: `isRoadNode`/`isVillageRoadConnected` already
  treat `tile.roadOwner === owner` as a road, and `canBuildRoad` may therefore continue a
  road from a tile adjacent to a bridge. `canBuildRoad` still rejects water tiles.

### 7. Rendering (`src/render/textureFactory.ts`, `src/render/mapRenderer.ts`)

- `TextureSet` gains `bridgeTextures: { nw: TileTexture; ne: TileTexture; we: TileTexture }`,
  loaded from `public/textures/bridge-nw.png`, `bridge-ne.png`, `bridge-we.png`
  (commit the currently untracked files).
- `TileView` gains `bridgeSprite: Sprite | null`. `applyTile` draws the bridge sprite
  (dir from `tile.bridge.dir`) at the water tile's pixel position, anchor 0.5, sized to the
  hex, above the terrain/water sprite and below units. Hidden when the tile is unexplored.
- `tileSignature` includes the bridge marker so tiles refresh when a bridge appears.

### 8. Score (`src/game/score.ts` or wherever board score is computed)

- Board score adds **+5 per owned bridge** at game end (`tile.bridge?.owner === player.index`).

### 9. AI (`src/game/aiTypes.ts`, `src/game/ai.ts`, `src/game/aiPatterns.ts`, simulator)

- New `AiAction` `{ type: 'buildBridge'; q: number; r: number }`; `runAiTurn` executes it.
- When the AI has the Bridges skill, a qualifying water tile gets a candidate score when it
  sits next to (or between) land the AI can use, so its armies can cross a water gap.
  Built bridges are then usable by AI movement automatically.

### 10. Docs

- `GAME.md`: Bridges skill row (parent Riding), a "Build bridge" entry under unit actions /
  building, bridge rules, and the +5 bridge score line.

## Tests

- `tests/bridges.test.ts` (new): `bridgeDirFor` axis detection on the three axes; no
  direction when shores are missing/water/occupied; `canBuildBridge` gating (skill, water,
  empty tile, affordability, building/unit/bridge present); `buildBridge` sets
  `bridge` + `roadOwner` and pays the cost; ports/temples rejected on a bridge.
- `tests/selection.test.ts` (or movement tests): a land unit can reach/stand on a bridged
  water tile and cross a one-hex water gap; ships still path through a bridged tile.
- `tests/simulator.test.ts`: `buildBridge` command emits `bridgeBuilt`; AI action type
  executes.
- `tests/skills.test.ts`: bridges parent `riding`, base cost 6.
- `tests/score.test.ts`: +5 per owned bridge in the board score.
- `tests/roads.test.ts`: `canBuildRoad` works from a tile adjacent to a bridge;
  `isVillageRoadConnected` treats a bridge as a road.
- `tests/mapRenderer.test.ts` (or render helper tests): bridge sprite drawn with the right
  orientation texture and hidden in fog.
- `tests/ai*.test.ts`: AI proposes `buildBridge` candidates with the skill.

## Out of scope

- No animated build presentation; no per-tile help dialog for bridges beyond the terrain
  selection.
- Bridges cannot be destroyed; no additional bridge level/upgrades.
- No change to port/temple water rules other than the bridge exclusion.
