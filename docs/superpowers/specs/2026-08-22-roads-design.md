# Roads Design

Date: 2026-08-22

## Problem

Add a roads feature: a player can build a road on a hex adjacent to one of their villages
or to another of their roads. Cost: 2 wood, 1 stone. Roads render as orange lines
connecting the hex's top-face center to the edge centers of connected villages/roads.

## Design

### 1. Data (`src/game/mapGen.ts`)

Add to `MapTile`:

```ts
roadOwner: number | null;
```

Initialize to `null` in `generateMap` when tiles are created.

### 2. Game logic — new `src/game/roads.ts`

```ts
export const ROAD_COST: Resources = { wood: 2, stone: 1, money: 0, ore: 0 };

export function canBuildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (tile.roadOwner !== null) return false;
  if (isWaterType(tile.terrain)) return false;
  if (tile.settlement !== null) return false;
  if (tile.building !== null) return false;
  if (tile.unit !== null && tile.unit.owner !== player.index) return false;
  const connected = hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    if (!t) return false;
    if (t.settlement && t.settlement.owner === player.index) return true;
    return t.roadOwner === player.index;
  });
  if (!connected) return false;
  return canAfford(player.resources, ROAD_COST);
}

export function buildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canBuildRoad(map, tile, player)) return false;
  player.resources = pay(player.resources, ROAD_COST);
  tile.roadOwner = player.index;
  return true;
}
```

Note: a player's own unit may remain on the tile (does not block); an enemy unit blocks.

### 3. Simulator (`src/game/simulator.ts`)

- Add to `Command`:
  `| { type: 'buildRoad'; q: number; r: number }`
- Add `doBuildRoad(q, r)` that builds and emits a `roadBuilt` event.
- Wire into the command switch (next to `build`).

### 4. Events (`src/game/events.ts`)

Add:

```ts
| { type: 'roadBuilt'; q: number; r: number; playerIndex: number }
```

### 5. Controller (`src/controller/gameController.ts`)

- `buildSelectedRoad()`: sends `{ type: 'buildRoad', q, r }` for the selected tile.
- `presentEvents`: handle `roadBuilt` (no-op; the subsequent `render()` redraws roads via the
  signature change).

### 6. Toolbar (`src/screens/hud/ActionToolbar.tsx`)

For a non-settlement selected tile, if `canBuildRoad(map, tile, player)`, add a button
"Build a road (2w, 1s)" calling `gameController.buildSelectedRoad()`, disabled when
unaffordable.

### 7. Renderer (`src/render/mapRenderer.ts` + `src/render/tileSignature.ts`)

- Add `tile.roadOwner` to `tileSignature` so road tiles redraw when roads are built.
- Add `roadGraphics: Graphics | null` to `TileView` (or draw into the tile's `el`).
- Drawing rule in `applyTile` when `tile.roadOwner !== null`:
  - center = `hexToPixel(tile)` with `y - tileElevation(tile, hexSize)` (top-face center).
  - For each edge `e` in 0..5, let `neighbor = tileAt(map, hexEdgeNeighbor(tile, e))`.
  - If `neighbor.settlement?.owner === tile.roadOwner` or `neighbor.roadOwner ===
    tile.roadOwner`, draw an orange line (color e.g. `0xff8c00`, width ~3) from the midpoint
    of `hexEdge(tile, e, hexSize)` (y-adjusted by elevation) to `center`.
- The line Graphics is redrawn whenever the road signature changes; a road hex with multiple
  connected neighbors draws multiple spokes, forming a connected network.

## Files touched

- `src/game/mapGen.ts`
- `src/game/roads.ts` (new)
- `src/game/events.ts`
- `src/game/simulator.ts`
- `src/controller/gameController.ts`
- `src/screens/hud/ActionToolbar.tsx`
- `src/render/mapRenderer.ts`
- `src/render/tileSignature.ts`
- `tests/roads.test.ts` (new), plus existing tests touched by the `Command`/`MapTile` changes

## Testing

- `roads.test.ts`: build rules (water/village/building/enemy-unit/duplicate blocks; requires
  adjacency to own village or own road; pays 2w 1s).
- Simulator: `buildRoad` command emits `roadBuilt` and mutates the tile.
- Existing suite + `npm run typecheck` pass.
- Manual: select a hex next to your village/road → button appears; building draws orange
  spokes to connected villages/roads.
