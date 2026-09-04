# Hide Fogged Elements in Renderer Design

Date: 2026-08-22

## Problem

In the map renderer, three kinds of content are drawn on tiles that are still under fog:

1. Territory (village) borders are drawn on fogged tiles.
2. Unit HP bars are drawn for fogged units.
3. Village name labels are drawn for fogged villages.

Units themselves are already hidden in fog (via `hiddenUnitIds` and `applyTile`), but these
three overlay/content elements leak through the fog.

## Design

In `src/render/mapRenderer.ts`, use the existing explored computation to gate each element:

```ts
const explored = !fogEnabled || isExploredFor(tile, localPlayerIndex);
```

### 1. Territory borders

`applyTile` already computes `explored`. After `this.drawTileTerritory(tv.territory, tile, players);`
(line 233), set the territory Graphics visibility to match:

```ts
this.drawTileTerritory(tv.territory, tile, players);
tv.territory.visible = explored;
```

Also skip the drawing work when unexplored by returning early in `drawTileTerritory` when
the tile is not explored. Pass `explored` (or `localPlayerIndex`/`fogEnabled`) into
`drawTileTerritory` and return early:

```ts
private drawTileTerritory(g: Graphics, tile: MapTile, players: Player[], explored: boolean): void {
  g.clear();
  if (!explored || tile.ownedBy === null) return;
  ...
}
```

Update the call site to pass `explored`.

### 2. Unit HP bars

In the `update` loop, compute `explored` per tile at the top of the loop body and guard the
HP-bar collection:

```ts
const explored = !fogEnabled || isExploredFor(tile, localPlayerIndex);
...
if (tile.unit && !hiddenUnitIds.has(tile.unit.id) && explored) {
```

### 3. Village name labels

Guard the label collection with the same `explored`:

```ts
if (tile.settlement && tile.settlement.owner !== null && explored) {
```

The capture-ready exclamation collection (line 113) also rides on fogged units — gate it on
`explored` too, since it references a fogged enemy unit:

```ts
if (tile.settlement && tile.settlement.captureReady && tile.unit && tile.unit.owner !== tile.settlement.owner && explored) {
```

## Files touched

- `src/render/mapRenderer.ts`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass (no game-logic changes).
- Manual: in a game with fog on, unexplored tiles show only fog — no territory borders, no
  HP bars, no village names, no exclamation markers. As tiles are explored they appear.
